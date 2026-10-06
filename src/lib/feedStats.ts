import { dayKey, startOfDay } from './time';
import type { BabyEvent } from './types';

const NOON_HOUR = 12;
/** Gaps longer than this usually mean overnight / a missed log. */
const MAX_FEED_GAP_MS = 8 * 60 * 60_000;

export interface FeedGap {
  fromAt: string;
  toAt: string;
  durationMs: number;
  day: string;
  period: 'morning' | 'afternoon';
}

export interface FeedDaySummary {
  day: string;
  feeds: BabyEvent[];
  count: number;
  bottleMl: number;
  bottleCount: number;
}

export interface FeedAverages {
  feedsPerDay: number | null;
  gapMs: number | null;
  morningGapMs: number | null;
  afternoonGapMs: number | null;
  bottleMlPerFeed: number | null;
  bottleMlPerDay: number | null;
  dayCount: number;
  feedCount: number;
}

function periodOf(iso: string): 'morning' | 'afternoon' {
  return new Date(iso).getHours() < NOON_HOUR ? 'morning' : 'afternoon';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function feedEvents(events: BabyEvent[]): BabyEvent[] {
  return events
    .filter((event) => event.type === 'feed')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function feedsForDay(events: BabyEvent[], day: string): BabyEvent[] {
  return feedEvents(events).filter((event) => dayKey(event.startedAt) === day);
}

export function bottleMl(event: BabyEvent): number {
  return event.details.method === 'bottle' && typeof event.details.amountMl === 'number'
    ? event.details.amountMl
    : 0;
}

export function totalBottleMl(feeds: BabyEvent[]): number {
  return feeds.reduce((sum, event) => sum + bottleMl(event), 0);
}

/** Time from one feed to the next, ignoring overnight-sized gaps. */
export function buildFeedGaps(events: BabyEvent[]): FeedGap[] {
  const feeds = feedEvents(events);
  const gaps: FeedGap[] = [];

  for (let i = 0; i < feeds.length - 1; i += 1) {
    const from = feeds[i];
    const to = feeds[i + 1];
    const durationMs = new Date(to.startedAt).getTime() - new Date(from.startedAt).getTime();
    if (durationMs <= 0 || durationMs > MAX_FEED_GAP_MS) continue;
    gaps.push({
      fromAt: from.startedAt,
      toAt: to.startedAt,
      durationMs,
      day: dayKey(to.startedAt),
      period: periodOf(to.startedAt),
    });
  }

  return gaps;
}

export function feedAverages(
  events: BabyEvent[],
  days = 7,
  now: number = Date.now(),
): FeedAverages {
  const cutoff = startOfDay(new Date(now));
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = dayKey(cutoff.toISOString());

  const feeds = feedEvents(events).filter((event) => dayKey(event.startedAt) >= cutoffKey);
  const gaps = buildFeedGaps(events).filter((gap) => gap.day >= cutoffKey);
  const morningGaps = gaps.filter((gap) => gap.period === 'morning');
  const afternoonGaps = gaps.filter((gap) => gap.period === 'afternoon');

  const byDay = new Map<string, BabyEvent[]>();
  for (const feed of feeds) {
    const key = dayKey(feed.startedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(feed);
    else byDay.set(key, [feed]);
  }

  const counts = [...byDay.values()].map((list) => list.length);
  const bottleAmounts = feeds.map(bottleMl).filter((ml) => ml > 0);
  const bottleByDay = [...byDay.values()].map((list) => totalBottleMl(list)).filter((ml) => ml > 0);

  return {
    feedsPerDay: average(counts),
    gapMs: average(gaps.map((gap) => gap.durationMs)),
    morningGapMs: average(morningGaps.map((gap) => gap.durationMs)),
    afternoonGapMs: average(afternoonGaps.map((gap) => gap.durationMs)),
    bottleMlPerFeed: average(bottleAmounts),
    bottleMlPerDay: average(bottleByDay),
    dayCount: byDay.size,
    feedCount: feeds.length,
  };
}

export function summarizeFeedDays(events: BabyEvent[]): FeedDaySummary[] {
  const byDay = new Map<string, BabyEvent[]>();
  for (const feed of feedEvents(events)) {
    const key = dayKey(feed.startedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(feed);
    else byDay.set(key, [feed]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, feeds]) => {
      const sorted = [...feeds].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const bottleFeeds = sorted.filter((event) => bottleMl(event) > 0);
      return {
        day,
        feeds: sorted,
        count: sorted.length,
        bottleMl: totalBottleMl(sorted),
        bottleCount: bottleFeeds.length,
      };
    });
}
