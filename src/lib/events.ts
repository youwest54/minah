import { formatDuration } from './time';
import type { BabyEvent, EventType } from './types';

export const TYPE_LABEL: Record<EventType, string> = {
  feed: 'Feed',
  sleep: 'Sleep',
  diaper: 'Diaper',
  note: 'Note',
};

export const FEED_METHOD_LABEL = {
  bottle: 'Bottle',
  solid: 'Solid food',
  breast: 'Feed',
} as const;

export const DIAPER_LABEL = {
  wet: 'Wet',
  dirty: 'Dirty',
  mixed: 'Wet + dirty',
} as const;

/** Headline shown in the timeline for one logged activity. */
export function eventTitle(event: BabyEvent): string {
  switch (event.type) {
    case 'feed': {
      const { method, amountMl } = event.details;
      if (method === 'bottle') return amountMl ? `Bottle · ${amountMl} ml` : 'Bottle';
      if (method === 'solid') return FEED_METHOD_LABEL.solid;
      if (method === 'breast') return 'Feed';
      return 'Feed';
    }
    case 'sleep':
      return event.endedAt
        ? `Slept ${formatDuration(new Date(event.endedAt).getTime() - new Date(event.startedAt).getTime())}`
        : 'Sleeping now';
    case 'diaper':
      return event.details.kind ? `${DIAPER_LABEL[event.details.kind]} diaper` : 'Diaper';
    case 'note':
      return event.details.text?.trim() || 'Note';
  }
}

export function sleepDurationMs(event: BabyEvent, now: number = Date.now()): number {
  const start = new Date(event.startedAt).getTime();
  const end = event.endedAt ? new Date(event.endedAt).getTime() : now;
  return Math.max(0, end - start);
}

export function isSameDay(iso: string, reference: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}
