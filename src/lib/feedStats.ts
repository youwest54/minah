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
  bottlesPerDay: number | null;
  gapMs: number | null;
  morningGapMs: number | null;
  afternoonGapMs: number | null;
  bottleMlPerFeed: number | null;
  bottleMlPerDay: number | null;
  morningBottleMlPerDay: number | null;
  afternoonBottleMlPerDay: number | null;
  dayCount: number;
  feedCount: number;
}

export interface BottleDayEstimate {
  /** Usual total bottle ml for a full day (past days only). */
  estimatedMl: number;
  /** Usual number of bottle feeds per day. */
  estimatedBottles: number;
  /** Usual number of any feeds per day. */
  estimatedFeeds: number;
  /** Usual size of one bottle. */
  usualBottleMl: number | null;
  /** Usual gap between feeds. */
  gapMs: number | null;
  todayMl: number;
  todayBottles: number;
  todayFeeds: number;
  remainingMl: number;
  progress: number;
  overTarget: boolean;
  /** When the next feed is likely, from last feed + usual gap. */
  nextFeedAt: string | null;
  nextFeedInMs: number | null;
  nextFeedOverdue: boolean;
  daysUsed: number;
}

function periodOf(iso: string): 'morning' | 'afternoon' {
  return new Date(iso).getHours() < NOON_HOUR ? 'morning' : 'afternoon';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bottleMlInPeriod(feeds: BabyEvent[], period: 'morning' | 'afternoon'): number {
  return feeds
    .filter((event) => periodOf(event.startedAt) === period)
    .reduce((sum, event) => sum + bottleMl(event), 0);
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
  const bottleCounts = [...byDay.values()].map(
    (list) => list.filter((event) => bottleMl(event) > 0).length,
  );
  const bottleAmounts = feeds.map(bottleMl).filter((ml) => ml > 0);
  const bottleByDay = [...byDay.values()].map((list) => totalBottleMl(list)).filter((ml) => ml > 0);
  const morningBottleByDay = [...byDay.values()]
    .map((list) => bottleMlInPeriod(list, 'morning'))
    .filter((ml) => ml > 0);
  const afternoonBottleByDay = [...byDay.values()]
    .map((list) => bottleMlInPeriod(list, 'afternoon'))
    .filter((ml) => ml > 0);

  return {
    feedsPerDay: average(counts),
    bottlesPerDay: average(bottleCounts.filter((count) => count > 0)),
    gapMs: average(gaps.map((gap) => gap.durationMs)),
    morningGapMs: average(morningGaps.map((gap) => gap.durationMs)),
    afternoonGapMs: average(afternoonGaps.map((gap) => gap.durationMs)),
    bottleMlPerFeed: average(bottleAmounts),
    bottleMlPerDay: average(bottleByDay),
    morningBottleMlPerDay: average(morningBottleByDay),
    afternoonBottleMlPerDay: average(afternoonBottleByDay),
    dayCount: byDay.size,
    feedCount: feeds.length,
  };
}

/**
 * Today's bottle progress vs the usual full day from past days (today excluded
 * so a half-finished day doesn't pull the target down).
 */
export function bottleDayEstimate(
  events: BabyEvent[],
  days = 7,
  now: number = Date.now(),
): BottleDayEstimate | null {
  const todayKey = dayKey(new Date(now).toISOString());
  const cutoff = startOfDay(new Date(now));
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = dayKey(cutoff.toISOString());

  const pastFeeds = feedEvents(events).filter((event) => {
    const key = dayKey(event.startedAt);
    return key >= cutoffKey && key < todayKey;
  });

  const byDay = new Map<string, BabyEvent[]>();
  for (const feed of pastFeeds) {
    const key = dayKey(feed.startedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(feed);
    else byDay.set(key, [feed]);
  }

  const bottleByDay = [...byDay.values()]
    .map((list) => totalBottleMl(list))
    .filter((ml) => ml > 0);
  const bottleCounts = [...byDay.values()]
    .map((list) => list.filter((event) => bottleMl(event) > 0).length)
    .filter((count) => count > 0);
  const feedCounts = [...byDay.values()].map((list) => list.length);
  const bottleAmounts = pastFeeds.map(bottleMl).filter((ml) => ml > 0);

  const estimatedMl = average(bottleByDay);
  if (estimatedMl === null || estimatedMl <= 0) return null;

  const todayFeeds = feedsForDay(events, todayKey);
  const todayMl = totalBottleMl(todayFeeds);
  const todayBottles = todayFeeds.filter((event) => bottleMl(event) > 0).length;
  const remainingMl = Math.max(0, Math.round(estimatedMl - todayMl));
  const progress = Math.min(1, todayMl / estimatedMl);

  const gapMs = average(
    buildFeedGaps(events)
      .filter((gap) => gap.day >= cutoffKey && gap.day < todayKey)
      .map((gap) => gap.durationMs),
  );

  const lastFeed = [...todayFeeds].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    ?? feedEvents(events).filter((event) => dayKey(event.startedAt) < todayKey).at(-1)
    ?? null;

  let nextFeedAt: string | null = null;
  let nextFeedInMs: number | null = null;
  let nextFeedOverdue = false;
  if (lastFeed && gapMs !== null) {
    const next = new Date(lastFeed.startedAt).getTime() + gapMs;
    nextFeedAt = new Date(next).toISOString();
    nextFeedInMs = next - now;
    nextFeedOverdue = nextFeedInMs <= 0;
  }

  return {
    estimatedMl: Math.round(estimatedMl),
    estimatedBottles: Math.round(average(bottleCounts) ?? 0),
    estimatedFeeds: Math.round((average(feedCounts) ?? 0) * 10) / 10,
    usualBottleMl:
      average(bottleAmounts) !== null ? Math.round(average(bottleAmounts) as number) : null,
    gapMs,
    todayMl,
    todayBottles,
    todayFeeds: todayFeeds.length,
    remainingMl,
    progress,
    overTarget: todayMl > estimatedMl,
    nextFeedAt,
    nextFeedInMs,
    nextFeedOverdue,
    daysUsed: bottleByDay.length,
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
