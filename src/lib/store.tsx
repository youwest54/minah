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
import { cloudConfigured, ensureSignedIn, supabase } from './supabase';
import * as storage from './storage';
import { LOCAL_HOUSEHOLD } from './storage';
import { nowIso } from './time';
import type { BabyEvent, EventDetails, EventType, Household, SyncState } from './types';

interface EventRow {
  id: string;
  household_id: string;
  type: EventType;
  started_at: string;
  ended_at: string | null;
  details: EventDetails | null;
  created_by: string | null;
  updated_at: string;
  deleted: boolean;
}

interface HouseholdRow {
  id: string;
  name: string;
  baby_name: string;
  join_code: string;
}

function fromRow(row: EventRow): BabyEvent {
  return {
    id: row.id,
    householdId: row.household_id,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    details: row.details ?? {},
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    deleted: row.deleted,
  };
}

function toRow(event: BabyEvent): EventRow {
  return {
    id: event.id,
    household_id: event.householdId,
    type: event.type,
    started_at: event.startedAt,
    ended_at: event.endedAt,
    details: event.details,
    created_by: event.createdBy,
    updated_at: event.updatedAt,
    deleted: event.deleted,
  };
}

function fromHouseholdRow(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    babyName: row.baby_name,
    joinCode: row.join_code,
    cloud: true,
  };
}

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
  cloudConfigured: boolean;
  error: string | null;
  clearError: () => void;
  addEvent: (input: NewEventInput) => BabyEvent;
  updateEvent: (id: string, patch: EventPatch) => void;
  deleteEvent: (id: string) => void;
  setBabyName: (name: string) => void;
  createHousehold: (babyName: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  leaveHousehold: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [household, setHouseholdState] = useState<Household>(() => storage.loadHousehold());
  const [events, setEvents] = useState<BabyEvent[]>(() =>
    storage.loadEvents(storage.loadHousehold().id),
  );
  const [sync, setSync] = useState<SyncState>(cloudConfigured ? 'syncing' : 'local-only');
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const eventsRef = useRef<BabyEvent[]>(events);
  const outboxRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  const householdIdRef = useRef(household.id);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  householdIdRef.current = household.id;
  const isCloud = household.cloud && supabase !== null;

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

  const push = useCallback(async () => {
    const client = supabase;
    const householdId = householdIdRef.current;
    if (!client || householdId === LOCAL_HOUSEHOLD.id) return;

    const ids = [...outboxRef.current];
    if (ids.length === 0) return;

    const rows = ids
      .map((id) => eventsRef.current.find((event) => event.id === id))
      .filter((event): event is BabyEvent => event !== undefined)
      .map(toRow);
    if (rows.length === 0) return;

    setSync('syncing');
    const { error: upsertError } = await client.from('events').upsert(rows);
    if (upsertError) {
      setSync('offline');
      return;
    }
    for (const id of ids) outboxRef.current.delete(id);
    persistOutbox();
    setSync('synced');
  }, [persistOutbox]);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      void push();
    }, 250);
  }, [push]);

  const pull = useCallback(async () => {
    const client = supabase;
    const householdId = householdIdRef.current;
    if (!client || householdId === LOCAL_HOUSEHOLD.id) return;

    setSync('syncing');
    const { data, error: selectError } = await client
      .from('events')
      .select('*')
      .eq('household_id', householdId)
      .order('started_at', { ascending: false })
      .limit(1000);

    if (selectError) {
      setSync('offline');
      return;
    }
    commitEvents(mergeEvents(eventsRef.current, (data as EventRow[]).map(fromRow)));
    setSync(outboxRef.current.size > 0 ? 'syncing' : 'synced');
  }, [commitEvents]);

  // Swap the local cache whenever the active household changes.
  useEffect(() => {
    const cached = storage.loadEvents(household.id);
    eventsRef.current = cached;
    setEvents(cached);
    outboxRef.current = new Set(storage.loadOutbox(household.id));
    setPendingCount(outboxRef.current.size);
  }, [household.id]);

  // Sign in, backfill from the server, and listen for the other parent's taps.
  useEffect(() => {
    if (!isCloud) {
      setSync(cloudConfigured ? 'synced' : 'local-only');
      return;
    }
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    void (async () => {
      try {
        userIdRef.current = await ensureSignedIn(client);
      } catch {
        if (!cancelled) setSync('offline');
        return;
      }
      if (cancelled) return;
      await push();
      if (!cancelled) await pull();
    })();

    const channel = client
      .channel(`events-${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `household_id=eq.${household.id}`,
        },
        (payload) => {
          const row = payload.new as EventRow | null;
          if (!row?.id) return;
          commitEvents(mergeEvents(eventsRef.current, [fromRow(row)]));
        },
      )
      .subscribe();

    const resync = () => {
      void push().then(pull);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };

    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(resync, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', resync);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [isCloud, household.id, push, pull, commitEvents]);

  const upsertLocal = useCallback(
    (event: BabyEvent) => {
      commitEvents(mergeEvents(eventsRef.current, [event]));
      // With no server to push to there is nothing to queue.
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
        createdBy: userIdRef.current,
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

  const setHousehold = useCallback((next: Household) => {
    storage.saveHousehold(next);
    setHouseholdState(next);
  }, []);

  const setBabyName = useCallback(
    (name: string) => {
      const trimmed = name.trim() || 'Baby';
      const next = { ...household, babyName: trimmed };
      setHousehold(next);
      if (household.cloud && supabase) {
        void supabase.from('households').update({ baby_name: trimmed }).eq('id', household.id);
      }
    },
    [household, setHousehold],
  );

  const createHousehold = useCallback(
    async (babyName: string) => {
      const client = supabase;
      if (!client) {
        setError('Cloud sharing is not configured yet.');
        return;
      }
      setError(null);
      try {
        await ensureSignedIn(client).then((id) => {
          userIdRef.current = id;
        });
        const { data, error: rpcError } = await client.rpc('create_household', {
          p_baby_name: babyName.trim() || 'Baby',
        });
        if (rpcError) throw rpcError;

        const next = fromHouseholdRow(data as HouseholdRow);

        // Carry anything already logged on this phone into the shared household.
        const existing = storage.loadEvents(householdIdRef.current).filter((e) => !e.deleted);
        if (existing.length > 0) {
          const moved = existing.map((event) => ({
            ...event,
            householdId: next.id,
            createdBy: userIdRef.current,
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
        setError(cause instanceof Error ? cause.message : 'Could not create the shared space.');
      }
    },
    [setHousehold],
  );

  const joinHousehold = useCallback(
    async (code: string) => {
      const client = supabase;
      if (!client) {
        setError('Cloud sharing is not configured yet.');
        return;
      }
      setError(null);
      try {
        await ensureSignedIn(client).then((id) => {
          userIdRef.current = id;
        });
        const { data, error: rpcError } = await client.rpc('join_household', {
          p_code: code.trim().toUpperCase(),
        });
        if (rpcError) throw rpcError;
        if (!data) throw new Error('That code did not match any family.');
        setHousehold(fromHouseholdRow(data as HouseholdRow));
      } catch (cause) {
        const message =
          cause instanceof Error && cause.message.includes('INVALID_CODE')
            ? 'That code did not match any family. Check the 6 characters and try again.'
            : cause instanceof Error
              ? cause.message
              : 'Could not join.';
        setError(message);
      }
    },
    [setHousehold],
  );

  const leaveHousehold = useCallback(async () => {
    setHousehold({ ...LOCAL_HOUSEHOLD, babyName: household.babyName });
  }, [household.babyName, setHousehold]);

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
      cloudConfigured,
      error,
      clearError: () => setError(null),
      addEvent,
      updateEvent,
      deleteEvent,
      setBabyName,
      createHousehold,
      joinHousehold,
      leaveHousehold,
    }),
    [
      household,
      visibleEvents,
      activeSleep,
      sync,
      pendingCount,
      error,
      addEvent,
      updateEvent,
      deleteEvent,
      setBabyName,
      createHousehold,
      joinHousehold,
      leaveHousehold,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>.');
  return value;
}
