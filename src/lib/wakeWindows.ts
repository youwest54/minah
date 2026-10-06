import { dayKey, startOfDay } from './time';
import type { BabyEvent } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Gaps longer than this usually mean a sleep wasn't logged (often overnight).
 * They still show in the timeline, but they are kept out of averages so one
 * missing nap can't make "usual wake" look like 10 hours.
 */
export const MAX_AVERAGE_WINDOW_MS = 6 * HOUR;

/** Noon in local time — morning windows start before this, afternoon after. */
export const NOON_HOUR = 12;

/**
 * One stretch of being awake: from waking (end of a sleep) until falling
 * asleep again (start of the next sleep). An open window has no `endedAt`
 * yet — she's still awake.
 */
export interface WakeWindow {
  /** When she woke up (previous sleep ended). */
  startedAt: string;
  /** When she fell asleep again, or null if still awake. */
  endedAt: string | null;
  /** Duration in ms. Uses `now` for open windows. */
  durationMs: number;
  /** Local day the window started on, e.g. "2026-10-06". */
  day: string;
  /** 1 = first wake of the day, 2 = second, … */
  slot: number;
  period: 'morning' | 'afternoon';
  open: boolean;
}

export interface PeriodAverage {
  morningMs: number | null;
  afternoonMs: number | null;
  overallMs: number | null;
  morningCount: number;
  afternoonCount: number;
  overallCount: number;
}

export interface SlotAverage {
  slot: number;
  averageMs: number;
  count: number;
}

export interface DayWakeSummary {
  day: string;
  windows: WakeWindow[];
  totalAwakeMs: number;
}

function periodOf(iso: string): 'morning' | 'afternoon' {
  return new Date(iso).getHours() < NOON_HOUR ? 'morning' : 'afternoon';
}

/**
 * Build wake windows from sleep entries.
 *
 * A wake window starts when a sleep ends (she woke) and ends when the next
 * sleep starts (she fell asleep again). If she's still awake after the latest
 * wake, that stretch is an open window ticking up to `now`.
 */
export function buildWakeWindows(events: BabyEvent[], now: number = Date.now()): WakeWindow[] {
  const wakes = events
    .filter((event) => event.type === 'sleep' && event.endedAt)
    .map((event) => event.endedAt as string)
    .sort((a, b) => a.localeCompare(b));

  const sleepStarts = events
    .filter((event) => event.type === 'sleep')
    .map((event) => event.startedAt)
    .sort((a, b) => a.localeCompare(b));

  const windows: WakeWindow[] = [];
  const latestWake = wakes[wakes.length - 1] ?? null;

  for (const wakeAt of wakes) {
    const fallAsleepAt = sleepStarts.find((start) => start > wakeAt) ?? null;

    if (fallAsleepAt) {
      windows.push({
        startedAt: wakeAt,
        endedAt: fallAsleepAt,
        durationMs: new Date(fallAsleepAt).getTime() - new Date(wakeAt).getTime(),
        day: dayKey(wakeAt),
        slot: 0,
        period: periodOf(wakeAt),
        open: false,
      });
      continue;
    }

    // Still awake since the most recent wake.
    if (wakeAt === latestWake) {
      windows.push({
        startedAt: wakeAt,
        endedAt: null,
        durationMs: Math.max(0, now - new Date(wakeAt).getTime()),
        day: dayKey(wakeAt),
        slot: 0,
        period: periodOf(wakeAt),
        open: true,
      });
    }
  }

  // Assign per-day slot numbers (1st wake, 2nd wake, …).
  const byDay = new Map<string, WakeWindow[]>();
  for (const window of windows) {
    const bucket = byDay.get(window.day);
    if (bucket) bucket.push(window);
    else byDay.set(window.day, [window]);
  }
  for (const dayWindows of byDay.values()) {
    dayWindows
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .forEach((window, index) => {
        window.slot = index + 1;
      });
  }

  return windows.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Closed windows short enough to count as real wake time, for averaging. */
function averageableWindows(windows: WakeWindow[]): WakeWindow[] {
  return windows.filter(
    (window) =>
      !window.open &&
      window.durationMs > 0 &&
      window.durationMs <= MAX_AVERAGE_WINDOW_MS,
  );
}

export function averageMs(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Averages over the last `days` calendar days (including today), from closed
 * wake windows only.
 */
export function periodAverages(
  windows: WakeWindow[],
  days = 7,
  now: number = Date.now(),
): PeriodAverage {
  const cutoff = startOfDay(new Date(now));
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = dayKey(cutoff.toISOString());

  const relevant = averageableWindows(windows).filter((window) => window.day >= cutoffKey);
  const morning = relevant.filter((window) => window.period === 'morning');
  const afternoon = relevant.filter((window) => window.period === 'afternoon');

  return {
    morningMs: averageMs(morning.map((w) => w.durationMs)),
    afternoonMs: averageMs(afternoon.map((w) => w.durationMs)),
    overallMs: averageMs(relevant.map((w) => w.durationMs)),
    morningCount: morning.length,
    afternoonCount: afternoon.length,
    overallCount: relevant.length,
  };
}

/** Average length of the 1st / 2nd / 3rd… wake of the day over recent days. */
export function slotAverages(
  windows: WakeWindow[],
  days = 7,
  now: number = Date.now(),
): SlotAverage[] {
  const cutoff = startOfDay(new Date(now));
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = dayKey(cutoff.toISOString());

  const bySlot = new Map<number, number[]>();
  for (const window of averageableWindows(windows)) {
    if (window.day < cutoffKey) continue;
    const list = bySlot.get(window.slot) ?? [];
    list.push(window.durationMs);
    bySlot.set(window.slot, list);
  }

  return [...bySlot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, values]) => ({
      slot,
      averageMs: averageMs(values) ?? 0,
      count: values.length,
    }));
}

export function windowsForDay(windows: WakeWindow[], day: string): WakeWindow[] {
  return windows
    .filter((window) => window.day === day)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function summarizeDays(windows: WakeWindow[]): DayWakeSummary[] {
  const byDay = new Map<string, WakeWindow[]>();
  for (const window of windows) {
    const bucket = byDay.get(window.day);
    if (bucket) bucket.push(window);
    else byDay.set(window.day, [window]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayWindows]) => ({
      day,
      windows: dayWindows.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      totalAwakeMs: dayWindows
        .filter((window) => !isLongGap(window))
        .reduce((sum, window) => sum + window.durationMs, 0),
    }));
}

export function isLongGap(window: WakeWindow): boolean {
  return !window.open && window.durationMs > MAX_AVERAGE_WINDOW_MS;
}

export function slotLabel(slot: number): string {
  if (slot === 1) return '1st wake';
  if (slot === 2) return '2nd wake';
  if (slot === 3) return '3rd wake';
  return `${slot}th wake`;
}
