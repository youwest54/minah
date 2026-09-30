import type { BabyEvent, EventDetails, EventType, Household } from './types';

interface ServerHousehold {
  id: string;
  babyName: string;
  joinCode: string;
}

interface ServerEvent {
  id: string;
  type: EventType;
  startedAt: string;
  endedAt: string | null;
  details: EventDetails;
  createdBy: string | null;
  updatedAt: string;
  deleted: boolean;
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `HTTP_${response.status}`);
  }

  return (await response.json()) as T;
}

function toHousehold(server: ServerHousehold): Household {
  return {
    id: server.id,
    babyName: server.babyName,
    joinCode: server.joinCode,
    cloud: true,
  };
}

function toEvent(server: ServerEvent, householdId: string): BabyEvent {
  return { ...server, householdId, details: server.details ?? {} };
}

/** The server has no use for householdId on each row; it is implied by the key. */
function toServerEvent(event: BabyEvent): ServerEvent {
  return {
    id: event.id,
    type: event.type,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    details: event.details,
    createdBy: event.createdBy,
    updatedAt: event.updatedAt,
    deleted: event.deleted,
  };
}

export async function createHousehold(babyName: string): Promise<Household> {
  const server = await request<ServerHousehold>('/api/household', {
    method: 'POST',
    body: JSON.stringify({ babyName }),
  });
  return toHousehold(server);
}

export async function joinHousehold(code: string): Promise<Household> {
  const server = await request<ServerHousehold>(
    `/api/household?code=${encodeURIComponent(code.trim().toUpperCase())}`,
  );
  return toHousehold(server);
}

export async function renameBaby(id: string, babyName: string): Promise<Household> {
  const server = await request<ServerHousehold>('/api/household', {
    method: 'PATCH',
    body: JSON.stringify({ id, babyName }),
  });
  return toHousehold(server);
}

export async function fetchEvents(householdId: string): Promise<BabyEvent[]> {
  const body = await request<{ events: ServerEvent[] }>(
    `/api/events?householdId=${encodeURIComponent(householdId)}`,
  );
  return body.events.map((event) => toEvent(event, householdId));
}

/** Sends local changes and returns the household's full merged history. */
export async function pushEvents(
  householdId: string,
  events: BabyEvent[],
): Promise<BabyEvent[]> {
  const body = await request<{ events: ServerEvent[] }>('/api/events', {
    method: 'POST',
    body: JSON.stringify({ householdId, events: events.map(toServerEvent) }),
  });
  return body.events.map((event) => toEvent(event, householdId));
}
