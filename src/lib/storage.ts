import type { BabyEvent, Household } from './types';

const HOUSEHOLD_KEY = 'minah.v1.household';
const eventsKey = (householdId: string) => `minah.v1.events.${householdId}`;
const outboxKey = (householdId: string) => `minah.v1.outbox.${householdId}`;

export const LOCAL_HOUSEHOLD: Household = {
  id: 'local',
  name: 'Home',
  babyName: 'Baby',
  joinCode: null,
  cloud: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota: the app keeps working in memory.
  }
}

export function loadHousehold(): Household {
  return read<Household>(HOUSEHOLD_KEY, LOCAL_HOUSEHOLD);
}

export function saveHousehold(household: Household): void {
  write(HOUSEHOLD_KEY, household);
}

export function loadEvents(householdId: string): BabyEvent[] {
  return read<BabyEvent[]>(eventsKey(householdId), []);
}

export function saveEvents(householdId: string, events: BabyEvent[]): void {
  write(eventsKey(householdId), events);
}

export function loadOutbox(householdId: string): string[] {
  return read<string[]>(outboxKey(householdId), []);
}

export function saveOutbox(householdId: string, ids: string[]): void {
  write(outboxKey(householdId), ids);
}
