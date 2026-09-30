import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as api from './api';
import { ApiError } from './api';
import * as storage from './storage';
import { LOCAL_HOUSEHOLD } from './storage';
import { nowIso } from './time';
import type { BabyEvent, EventDetails, EventType, Household, SyncState } from './types';

/** How often to look for the other phone's entries while the app is open. */
const POLL_INTERVAL_MS = 15_000;
const PUSH_DEBOUNCE_MS = 400;

/** Last write wins, compared on `updatedAt`, newest activity first. */
function mergeEvents(current: BabyEvent[], incoming: BabyEvent[]): BabyEvent[] {
  const byId = new Map<string, BabyEvent>();
  for (const event of current) byId.set(event.id, event);
  for (const event of incoming) {
    const existing = byId.get(event.id);
    if (!existing || event.updatedAt > existing.updatedAt) byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function friendlyError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'INVALID_CODE') {
      return 'That code did not match any family. Check the letters and try again.';
    }
    if (cause.code === 'NOT_FOUND') return 'That family no longer exists.';
  }
  return 'Could not reach the server. Check your connection and try again.';
}

export interface NewEventInput {
  type: EventType;
  startedAt: Date;
  endedAt?: Date | null;
  details?: EventDetails;
}

export interface EventPatch {
  startedAt?: Date;
  endedAt?: Date | null;
  details?: EventDetails;
}

interface StoreValue {
  household: Household;
  events: BabyEvent[];
  activeSleep: BabyEvent | null;
  sync: SyncState;
  pendingCount: number;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  addEvent: (input: NewEventInput) => BabyEvent;
  updateEvent: (id: string, patch: EventPatch) => void;
  deleteEvent: (id: string) => void;
  setBabyName: (name: string) => void;
  createHousehold: (babyName: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  leaveHousehold: () => void;
  refresh: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** A stable per-phone id, so entries can record which device logged them. */
function deviceId(): string {
  const key = 'minah.v1.device';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Supports links like https://…/#join=ABCD2345 shared with a partner. */
function joinCodeFromUrl(): string | null {
  const source = `${window.location.hash} ${window.location.search}`;
  const match = /join=([A-Za-z0-9]{6,12})/.exec(source);
  return match ? match[1].toUpperCase() : null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [household, setHouseholdState] = useState<Household>(() => storage.loadHousehold());
  const [events, setEvents] = useState<BabyEvent[]>(() =>
    storage.loadEvents(storage.loadHousehold().id),
  );
  const [sync, setSync] = useState<SyncState>(() =>
    storage.loadHousehold().cloud ? 'syncing' : 'local-only',
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsRef = useRef<BabyEvent[]>(events);
  const outboxRef = useRef<Set<string>>(new Set());
  const householdIdRef = useRef(household.id);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLinkHandledRef = useRef(false);

  householdIdRef.current = household.id;
  const isCloud = household.cloud;

  const commitEvents = useCallback((next: BabyEvent[]) => {
    eventsRef.current = next;
    setEvents(next);
    storage.saveEvents(householdIdRef.current, next);
  }, []);

  const persistOutbox = useCallback(() => {
    const ids = [...outboxRef.current];
    storage.saveOutbox(householdIdRef.current, ids);
    setPendingCount(ids.length);
  }, []);

  const setHousehold = useCallback((next: Household) => {
    storage.saveHousehold(next);
    setHouseholdState(next);
  }, []);

  /**
   * One round trip does both directions: unsent entries go up and the server
   * answers with the household's whole history, which includes anything the
   * other phone added.
   */
  const syncNow = useCallback(async () => {
    const householdId = householdIdRef.current;
    if (householdId === LOCAL_HOUSEHOLD.id) return;

    const pending = [...outboxRef.current]
      .map((id) => eventsRef.current.find((event) => event.id === id))
      .filter((event): event is BabyEvent => event !== undefined);

    setSync('syncing');
    try {
      const serverEvents =
        pending.length > 0
          ? await api.pushEvents(householdId, pending)
          : await api.fetchEvents(householdId);

      // Only clear what was actually sent; anything logged mid-request stays queued.
      for (const event of pending) outboxRef.current.delete(event.id);
      persistOutbox();

      commitEvents(mergeEvents(eventsRef.current, serverEvents));
      setSync(outboxRef.current.size > 0 ? 'syncing' : 'synced');
    } catch {
      setSync('offline');
    }
  }, [commitEvents, persistOutbox]);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => void syncNow(), PUSH_DEBOUNCE_MS);
  }, [syncNow]);

  // Swap the local cache whenever the active household changes.
  useEffect(() => {
    const cached = storage.loadEvents(household.id);
    eventsRef.current = cached;
    setEvents(cached);
    outboxRef.current = new Set(storage.loadOutbox(household.id));
    setPendingCount(outboxRef.current.size);
  }, [household.id]);

  // Keep in step with the server while the app is open.
  useEffect(() => {
    if (!isCloud) {
      setSync('local-only');
      return;
    }

    void syncNow();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const onOnline = () => void syncNow();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [isCloud, household.id, syncNow]);

  const upsertLocal = useCallback(
    (event: BabyEvent) => {
      commitEvents(mergeEvents(eventsRef.current, [event]));
      if (householdIdRef.current === LOCAL_HOUSEHOLD.id) return;
      outboxRef.current.add(event.id);
      persistOutbox();
      schedulePush();
    },
    [commitEvents, persistOutbox, schedulePush],
  );

  const addEvent = useCallback(
    (input: NewEventInput): BabyEvent => {
      const event: BabyEvent = {
        id: crypto.randomUUID(),
        householdId: householdIdRef.current,
        type: input.type,
        startedAt: input.startedAt.toISOString(),
        endedAt: input.endedAt ? input.endedAt.toISOString() : null,
        details: input.details ?? {},
        createdBy: deviceId(),
        updatedAt: nowIso(),
        deleted: false,
      };
      upsertLocal(event);
      return event;
    },
    [upsertLocal],
  );

  const updateEvent = useCallback(
    (id: string, patch: EventPatch) => {
      const existing = eventsRef.current.find((event) => event.id === id);
      if (!existing) return;
      upsertLocal({
        ...existing,
        startedAt: patch.startedAt ? patch.startedAt.toISOString() : existing.startedAt,
        endedAt:
          patch.endedAt === undefined
            ? existing.endedAt
            : patch.endedAt === null
              ? null
              : patch.endedAt.toISOString(),
        details: patch.details ?? existing.details,
        updatedAt: nowIso(),
      });
    },
    [upsertLocal],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      const existing = eventsRef.current.find((event) => event.id === id);
      if (!existing) return;
      upsertLocal({ ...existing, deleted: true, updatedAt: nowIso() });
    },
    [upsertLocal],
  );

  const setBabyName = useCallback(
    (name: string) => {
      const trimmed = name.trim() || 'Baby';
      setHousehold({ ...household, babyName: trimmed });
      if (household.cloud) {
        void api.renameBaby(household.id, trimmed).catch(() => {
          // The name is already saved on this phone; the next edit retries.
        });
      }
    },
    [household, setHousehold],
  );

  const createHousehold = useCallback(
    async (babyName: string) => {
      setError(null);
      setBusy(true);
      try {
        const next = await api.createHousehold(babyName);

        // Carry anything already logged on this phone into the shared family.
        const existing = storage.loadEvents(householdIdRef.current).filter((e) => !e.deleted);
        if (existing.length > 0) {
          const moved = existing.map((event) => ({
            ...event,
            householdId: next.id,
            updatedAt: nowIso(),
          }));
          storage.saveEvents(next.id, moved);
          storage.saveOutbox(
            next.id,
            moved.map((event) => event.id),
          );
        }
        setHousehold(next);
      } catch (cause) {
        setError(friendlyError(cause));
      } finally {
        setBusy(false);
      }
    },
    [setHousehold],
  );

  const joinHousehold = useCallback(
    async (code: string) => {
      setError(null);
      setBusy(true);
      try {
        setHousehold(await api.joinHousehold(code));
      } catch (cause) {
        setError(friendlyError(cause));
      } finally {
        setBusy(false);
      }
    },
    [setHousehold],
  );

  const leaveHousehold = useCallback(() => {
    setHousehold({ ...LOCAL_HOUSEHOLD, babyName: household.babyName });
  }, [household.babyName, setHousehold]);

  // A shared link joins the family straight away, with no code to type.
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const code = joinCodeFromUrl();
    if (!code) return;

    deepLinkHandledRef.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (code === household.joinCode) return;
    void joinHousehold(code);
  }, [household.joinCode, joinHousehold]);

  const visibleEvents = useMemo(() => events.filter((event) => !event.deleted), [events]);

  const activeSleep = useMemo(
    () => visibleEvents.find((event) => event.type === 'sleep' && event.endedAt === null) ?? null,
    [visibleEvents],
  );

  const value = useMemo<StoreValue>(
    () => ({
      household,
      events: visibleEvents,
      activeSleep,
      sync,
      pendingCount,
      busy,
      error,
      clearError: () => setError(null),
      addEvent,
      updateEvent,
      deleteEvent,
      setBabyName,
      createHousehold,
      joinHousehold,
      leaveHousehold,
      refresh: () => void syncNow(),
    }),
    [
      household,
      visibleEvents,
      activeSleep,
      sync,
      pendingCount,
      busy,
      error,
      addEvent,
      updateEvent,
      deleteEvent,
      setBabyName,
      createHousehold,
      joinHousehold,
      leaveHousehold,
      syncNow,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>.');
  return value;
}
