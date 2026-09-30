import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

/**
 * The whole server side of Minah: two households endpoints and two events
 * endpoints, stored in Netlify Blobs.
 *
 * There are no passwords. A household id (a UUID) is the secret that grants
 * access to its entries, and the short join code exists only so it can be typed
 * or put in a link.
 */

// No 0/O/1/I/L so a code stays readable when it is read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

const EVENT_TYPES = ['feed', 'sleep', 'diaper', 'note'] as const;
const FEED_METHODS = ['bottle', 'breast', 'solid'] as const;
const BREAST_SIDES = ['left', 'right', 'both'] as const;
const DIAPER_KINDS = ['wet', 'dirty', 'mixed'] as const;

const MAX_EVENTS_PER_REQUEST = 500;
const MAX_EVENTS_PER_HOUSEHOLD = 20_000;
const MAX_NOTE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
/**
 * Retries for a conditional write losing a race with another phone. Only one
 * writer wins each round, so this has to comfortably exceed the number of
 * phones that might save at the same instant.
 */
const WRITE_ATTEMPTS = 15;

type EventType = (typeof EVENT_TYPES)[number];

interface StoredDetails {
  method?: (typeof FEED_METHODS)[number];
  amountMl?: number;
  side?: (typeof BREAST_SIDES)[number];
  kind?: (typeof DIAPER_KINDS)[number];
  text?: string;
}

interface StoredEvent {
  id: string;
  type: EventType;
  startedAt: string;
  endedAt: string | null;
  details: StoredDetails;
  createdBy: string | null;
  updatedAt: string;
  deleted: boolean;
}

interface StoredHousehold {
  id: string;
  babyName: string;
  joinCode: string;
  createdAt: string;
}

const households = () => getStore('minah-households');
const codes = () => getStore('minah-codes');
const events = () => getStore('minah-events');

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function fail(error: string, status: number): Response {
  return json({ error }, status);
}

/** Jittered backoff, so simultaneous writers do not keep colliding in step. */
function pause(attempt: number): Promise<void> {
  const delay = 15 * (attempt + 1) + Math.random() * 40;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function cleanBabyName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
  return name || 'Baby';
}

function cleanDetails(value: unknown): StoredDetails {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const details: StoredDetails = {};

  if (FEED_METHODS.includes(raw.method as never)) {
    details.method = raw.method as StoredDetails['method'];
  }
  if (typeof raw.amountMl === 'number' && Number.isFinite(raw.amountMl)) {
    details.amountMl = Math.min(2000, Math.max(0, Math.round(raw.amountMl)));
  }
  if (BREAST_SIDES.includes(raw.side as never)) {
    details.side = raw.side as StoredDetails['side'];
  }
  if (DIAPER_KINDS.includes(raw.kind as never)) {
    details.kind = raw.kind as StoredDetails['kind'];
  }
  if (typeof raw.text === 'string' && raw.text.trim()) {
    details.text = raw.text.slice(0, MAX_NOTE_LENGTH);
  }
  return details;
}

/** Drops anything malformed rather than letting it poison the stored history. */
function cleanEvent(value: unknown): StoredEvent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.length < 8 || raw.id.length > 64) return null;
  if (!EVENT_TYPES.includes(raw.type as never)) return null;
  if (!isIsoDate(raw.startedAt)) return null;
  if (!isIsoDate(raw.updatedAt)) return null;
  if (raw.endedAt != null && !isIsoDate(raw.endedAt)) return null;

  return {
    id: raw.id,
    type: raw.type as EventType,
    startedAt: new Date(raw.startedAt).toISOString(),
    endedAt: raw.endedAt == null ? null : new Date(raw.endedAt as string).toISOString(),
    details: cleanDetails(raw.details),
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy.slice(0, 64) : null,
    updatedAt: new Date(raw.updatedAt).toISOString(),
    deleted: raw.deleted === true,
  };
}

/** Newest edit of each entry wins, newest activity first. */
function mergeById(existing: StoredEvent[], incoming: StoredEvent[]): StoredEvent[] {
  const byId = new Map<string, StoredEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) {
    const previous = byId.get(event.id);
    if (!previous || event.updatedAt > previous.updatedAt) byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, MAX_EVENTS_PER_HOUSEHOLD);
}

async function readHousehold(id: string): Promise<StoredHousehold | null> {
  const record = await households().get(id, { type: 'json', consistency: 'strong' });
  return record && typeof record === 'object' ? (record as StoredHousehold) : null;
}

async function createHousehold(babyName: string): Promise<StoredHousehold> {
  const id = crypto.randomUUID();

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const joinCode = randomCode();
    // onlyIfNew makes claiming a code atomic, so two families can never end up
    // sharing one.
    const claim = await codes().set(joinCode, id, { onlyIfNew: true });
    if (!claim.modified) continue;

    const household: StoredHousehold = {
      id,
      babyName,
      joinCode,
      createdAt: new Date().toISOString(),
    };
    await households().setJSON(id, household);
    return household;
  }

  throw new Error('CODE_EXHAUSTED');
}

/**
 * Read, merge, conditional-write, retry. The etag check means a save from the
 * other phone landing at the same moment can never be silently dropped.
 */
async function saveEvents(householdId: string, incoming: StoredEvent[]): Promise<StoredEvent[]> {
  const store = events();

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const current = await store.getWithMetadata(householdId, {
      type: 'json',
      consistency: 'strong',
    });
    const existing: StoredEvent[] = Array.isArray(current?.data)
      ? (current.data as StoredEvent[])
      : [];
    const merged = mergeById(existing, incoming);

    if (incoming.length === 0) return merged;

    const result = current?.etag
      ? await store.setJSON(householdId, merged, { onlyIfMatch: current.etag })
      : current
        ? await store.setJSON(householdId, merged)
        : await store.setJSON(householdId, merged, { onlyIfNew: true });

    if (result.modified) return merged;
    await pause(attempt);
  }

  throw new Error('WRITE_CONFLICT');
}

async function readEvents(householdId: string): Promise<StoredEvent[]> {
  const stored = await events().get(householdId, { type: 'json', consistency: 'strong' });
  return Array.isArray(stored) ? (stored as StoredEvent[]) : [];
}

async function handleHousehold(request: Request, url: URL): Promise<Response> {
  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { babyName?: unknown } | null;
    const household = await createHousehold(cleanBabyName(body?.babyName));
    return json(household, 201);
  }

  if (request.method === 'GET') {
    const code = url.searchParams.get('code');
    const id = url.searchParams.get('id');

    if (code) {
      const normalised = code.trim().toUpperCase();
      const householdId = await codes().get(normalised, {
        type: 'text',
        consistency: 'strong',
      });
      if (!householdId) return fail('INVALID_CODE', 404);
      const household = await readHousehold(householdId);
      return household ? json(household) : fail('INVALID_CODE', 404);
    }

    if (isUuid(id)) {
      const household = await readHousehold(id);
      return household ? json(household) : fail('NOT_FOUND', 404);
    }

    return fail('MISSING_CODE_OR_ID', 400);
  }

  if (request.method === 'PATCH') {
    const body = (await request.json().catch(() => null)) as {
      id?: unknown;
      babyName?: unknown;
    } | null;
    if (!isUuid(body?.id)) return fail('INVALID_ID', 400);

    const household = await readHousehold(body.id);
    if (!household) return fail('NOT_FOUND', 404);

    const updated: StoredHousehold = { ...household, babyName: cleanBabyName(body.babyName) };
    await households().setJSON(updated.id, updated);
    return json(updated);
  }

  return fail('METHOD_NOT_ALLOWED', 405);
}

async function handleEvents(request: Request, url: URL): Promise<Response> {
  if (request.method === 'GET') {
    const householdId = url.searchParams.get('householdId');
    if (!isUuid(householdId)) return fail('INVALID_HOUSEHOLD', 400);
    if (!(await readHousehold(householdId))) return fail('NOT_FOUND', 404);
    return json({ events: await readEvents(householdId) });
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      householdId?: unknown;
      events?: unknown;
    } | null;

    if (!isUuid(body?.householdId)) return fail('INVALID_HOUSEHOLD', 400);
    if (!Array.isArray(body.events)) return fail('INVALID_EVENTS', 400);
    if (body.events.length > MAX_EVENTS_PER_REQUEST) return fail('TOO_MANY_EVENTS', 413);
    if (!(await readHousehold(body.householdId))) return fail('NOT_FOUND', 404);

    const incoming = body.events
      .map(cleanEvent)
      .filter((event): event is StoredEvent => event !== null);

    return json({ events: await saveEvents(body.householdId, incoming) });
  }

  return fail('METHOD_NOT_ALLOWED', 405);
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  try {
    if (path === '/api/household') return await handleHousehold(request, url);
    if (path === '/api/events') return await handleEvents(request, url);
    return fail('NOT_FOUND', 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SERVER_ERROR';
    // A conflict is retryable: the phone keeps the entry queued and tries again.
    return fail(message, message === 'WRITE_CONFLICT' ? 409 : 500);
  }
};

export const config: Config = {
  path: ['/api/household', '/api/events'],
};
