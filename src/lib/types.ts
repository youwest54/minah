export type EventType = 'feed' | 'sleep' | 'diaper' | 'note';

export type FeedMethod = 'bottle' | 'breast' | 'solid';
export type BreastSide = 'left' | 'right' | 'both';
export type DiaperKind = 'wet' | 'dirty' | 'mixed';

export interface EventDetails {
  method?: FeedMethod;
  amountMl?: number;
  side?: BreastSide;
  kind?: DiaperKind;
  text?: string;
}

/**
 * A single logged activity. `endedAt` is only used by sleep: a sleep row with a
 * null `endedAt` means the baby is asleep right now.
 *
 * Rows are never hard-deleted so that deletions can propagate to other phones;
 * conflicts between devices are resolved by taking the newer `updatedAt`.
 */
export interface BabyEvent {
  id: string;
  householdId: string;
  type: EventType;
  startedAt: string;
  endedAt: string | null;
  details: EventDetails;
  createdBy: string | null;
  updatedAt: string;
  deleted: boolean;
}

export interface Household {
  id: string;
  name: string;
  babyName: string;
  joinCode: string | null;
  /** False for the on-device-only household used before Supabase is set up. */
  cloud: boolean;
}

export type SyncState = 'offline' | 'syncing' | 'synced' | 'local-only';
