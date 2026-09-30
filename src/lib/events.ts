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
  breast: 'Breast',
  solid: 'Solid food',
} as const;

export const SIDE_LABEL = {
  left: 'left',
  right: 'right',
  both: 'both sides',
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
      const { method, amountMl, side } = event.details;
      if (method === 'bottle') return amountMl ? `Bottle · ${amountMl} ml` : 'Bottle';
      if (method === 'breast') return side ? `Breast · ${SIDE_LABEL[side]}` : 'Breast';
      if (method === 'solid') return FEED_METHOD_LABEL.solid;
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
