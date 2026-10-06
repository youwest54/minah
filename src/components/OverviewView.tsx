import { useMemo } from 'react';
import { BottleIcon, MoonIcon, SunIcon } from './Icons';
import { useStore } from '../lib/store';
import { useNow } from '../hooks/useNow';
import { eventTitle } from '../lib/events';
import {
  bottleFeedTimeEstimate,
  feedsForDay,
  summarizeFeedDays,
  totalBottleMl,
} from '../lib/feedStats';
import { dayKey, dayLabel, formatAgo, formatClock, formatDuration, formatStopwatch, startOfDay } from '../lib/time';
import {
  buildWakeWindows,
  estimateSleep,
  estimateWake,
  isLongGap,
  periodAverages,
  slotAverages,
  sleepSlotAverages,
  sleepSlotLabel,
  slotLabel,
  summarizeDays,
  windowsForDay,
  type WakeWindow,
} from '../lib/wakeWindows';

const LOOKBACK_DAYS = 7;

function compareToAverage(actualMs: number, averageMs: number | null): string | null {
  if (averageMs === null || averageMs <= 0) return null;
  const diff = actualMs - averageMs;
  const abs = Math.abs(diff);
  if (abs < 5 * 60_000) return 'about average';
  return diff > 0
    ? `${formatDuration(abs)} longer than usual`
    : `${formatDuration(abs)} shorter than usual`;
}

function WindowRow({
  window,
  averageMs,
  now,
}: {
  window: WakeWindow;
  averageMs: number | null;
  now: number;
}) {
  const longGap = isLongGap(window);
  const estimate =
    averageMs && averageMs > 0
      ? estimateWake(
          window.slot,
          window.startedAt,
          new Map([[window.slot, averageMs]]),
          averageMs,
          now,
        )
      : null;
  const compare =
    window.open || longGap ? null : compareToAverage(window.durationMs, averageMs);

  return (
    <li className={`wake-row${window.open ? ' wake-row--open' : ''}${longGap ? ' wake-row--gap' : ''}`}>
      <span className={`wake-period wake-period--${window.period}`}>
        {window.period === 'morning' ? (
          <SunIcon width={14} height={14} />
        ) : (
          <MoonIcon width={14} height={14} />
        )}
        {slotLabel(window.slot)}
      </span>

      <div className="wake-main">
        <strong className="wake-duration">
          {window.open ? formatStopwatch(window.durationMs) : formatDuration(window.durationMs)}
          {window.open ? <em> awake now</em> : <em> awake</em>}
        </strong>
        <span className="wake-range">
          Woke {formatClock(window.startedAt)}
          {window.endedAt ? ` → slept ${formatClock(window.endedAt)}` : ' → still awake'}
        </span>
        <span className="wake-sleep">
          Slept {formatDuration(window.sleptBeforeMs)} before
          {window.sleptAfterMs !== null
            ? window.sleptAfterOpen
              ? ` · sleeping now ${formatDuration(window.sleptAfterMs)}`
              : ` · then slept ${formatDuration(window.sleptAfterMs)}`
            : ''}
        </span>
        {estimate && !longGap ? (
          <span className="wake-estimate">
            Usually ~{formatDuration(estimate.estimatedMs)} for this wake
            {window.open
              ? estimate.overdue
                ? ` · past usual (next sleep was ~${formatClock(estimate.nextSleepAt)})`
                : ` · next sleep ~${formatClock(estimate.nextSleepAt)} · ${formatDuration(estimate.remainingMs)} left`
              : null}
          </span>
        ) : null}
        {longGap ? (
          <span className="wake-compare">Long gap — a sleep may be missing</span>
        ) : null}
        {compare ? <span className="wake-compare">{compare}</span> : null}
      </div>
    </li>
  );
}

function sleepOverlapMs(
  startedAt: string,
  endedAt: string | null,
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  const start = Math.max(new Date(startedAt).getTime(), dayStart);
  const end = Math.min(endedAt ? new Date(endedAt).getTime() : now, dayEnd);
  return Math.max(0, end - start);
}

export function OverviewView() {
  const { household, events, activeSleep } = useStore();
  const now = useNow(1000);

  const todayKey = dayKey(new Date(now).toISOString());
  const dayStart = startOfDay(new Date(now)).getTime();
  const dayEnd = dayStart + 86_400_000;

  const windows = useMemo(() => buildWakeWindows(events, now), [events, now]);
  const averages = useMemo(() => periodAverages(windows, LOOKBACK_DAYS, now), [windows, now]);
  const slots = useMemo(() => slotAverages(windows, LOOKBACK_DAYS, now), [windows, now]);
  const sleepSlots = useMemo(
    () => sleepSlotAverages(windows, LOOKBACK_DAYS, now),
    [windows, now],
  );
  const todayWindows = useMemo(() => windowsForDay(windows, todayKey), [windows, todayKey]);
  const pastDays = useMemo(
    () => summarizeDays(windows).filter((day) => day.day !== todayKey).slice(0, LOOKBACK_DAYS),
    [windows, todayKey],
  );

  const slotAverageMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const slot of slots) map.set(slot.slot, slot.averageMs);
    return map;
  }, [slots]);

  const sleepAverageMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const slot of sleepSlots) map.set(slot.slot, slot.averageMs);
    return map;
  }, [sleepSlots]);

  const todayFeeds = useMemo(() => feedsForDay(events, todayKey), [events, todayKey]);
  const todayBottleMl = useMemo(() => totalBottleMl(todayFeeds), [todayFeeds]);
  const todayDiapers = useMemo(
    () => events.filter((event) => event.type === 'diaper' && dayKey(event.startedAt) === todayKey),
    [events, todayKey],
  );
  const sleepToday = useMemo(
    () =>
      events
        .filter((event) => event.type === 'sleep')
        .reduce(
          (total, event) =>
            total + sleepOverlapMs(event.startedAt, event.endedAt, dayStart, dayEnd, now),
          0,
        ),
    [events, dayStart, dayEnd, now],
  );

  const bottleTime = useMemo(
    () => bottleFeedTimeEstimate(events, LOOKBACK_DAYS, now),
    [events, now],
  );
  const pastFeedDays = useMemo(
    () => summarizeFeedDays(events).filter((day) => day.day !== todayKey).slice(0, LOOKBACK_DAYS),
    [events, todayKey],
  );

  const lastFeed = todayFeeds[todayFeeds.length - 1] ?? null;
  const currentlyAwake = !activeSleep && todayWindows.some((window) => window.open);
  const openWindow = todayWindows.find((window) => window.open) ?? null;
  const liveEstimate = openWindow
    ? estimateWake(
        openWindow.slot,
        openWindow.startedAt,
        slotAverageMap,
        averages.overallMs,
        now,
      )
    : null;

  const napWindow = todayWindows.find((window) => window.sleptAfterOpen) ?? null;
  const liveSleepEstimate =
    activeSleep && napWindow
      ? estimateSleep(napWindow.slot + 1, activeSleep.startedAt, sleepAverageMap, now)
      : activeSleep && todayWindows.length === 0
        ? estimateSleep(1, activeSleep.startedAt, sleepAverageMap, now)
        : null;

  const estimateSlots = useMemo(() => {
    const keys = new Set([...slots.map((s) => s.slot), ...sleepSlots.map((s) => s.slot)]);
    return [...keys].sort((a, b) => a - b);
  }, [slots, sleepSlots]);

  return (
    <div className="view">
      <header className="greeting">
        <p>Day so far for {household.babyName}</p>
        <h1>Overview</h1>
      </header>

      {/* Same today totals as the Home screen: feeds / sleep / diapers */}
      <section className="summary" aria-label="Today so far">
        <div className="summary-item">
          <strong>{todayFeeds.length}</strong>
          <span>feeds</span>
        </div>
        <div className="summary-item">
          <strong>{sleepToday > 0 ? formatDuration(sleepToday) : '—'}</strong>
          <span>sleep</span>
        </div>
        <div className="summary-item">
          <strong>{todayDiapers.length}</strong>
          <span>diapers</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">
            <BottleIcon width={16} height={16} className="panel-title-icon" />
            Bottle feed time
          </h2>
          {lastFeed ? (
            <span className="panel-meta">Last {formatAgo(lastFeed.startedAt, now)}</span>
          ) : null}
        </div>

        {bottleTime ? (
          <div className="bottle-estimate">
            <p className="estimate-card-label">Estimated next bottle</p>
            <strong className="bottle-estimate-ml">
              {bottleTime.nextFeedOverdue
                ? formatClock(bottleTime.nextFeedAt)
                : formatClock(bottleTime.nextFeedAt)}
            </strong>
            <p className="estimate-card-next">
              {bottleTime.nextFeedOverdue
                ? `Past usual time · usually every ${formatDuration(bottleTime.gapMs)}`
                : `In ${formatDuration(bottleTime.nextFeedInMs)} · usually every ${formatDuration(bottleTime.gapMs)}`}
              {` · from ${bottleTime.daysUsed} day${bottleTime.daysUsed === 1 ? '' : 's'}`}
            </p>
          </div>
        ) : (
          <p className="empty">
            Log a few bottle feeds — then you'll see when the next one is usually due.
          </p>
        )}

        {todayFeeds.length === 0 ? (
          <p className="empty">No feeds logged today yet.</p>
        ) : (
          <ul className="feed-list">
            {[...todayFeeds].reverse().map((feed) => (
              <li key={feed.id} className="feed-row">
                <span className="feed-time">{formatClock(feed.startedAt)}</span>
                <span className="feed-title">{eventTitle(feed)}</span>
              </li>
            ))}
          </ul>
        )}

        {todayBottleMl > 0 ? (
          <p className="overview-hint">Bottle today: {todayBottleMl} ml</p>
        ) : null}

        {pastFeedDays.length > 0 ? (
          <div className="past-feeds">
            {pastFeedDays.map((day) => (
              <div key={day.day} className="past-feed-day">
                <div className="panel-head">
                  <h3 className="past-day-title">{dayLabel(day.day)}</h3>
                  <span className="panel-meta">
                    {day.count} feed{day.count === 1 ? '' : 's'}
                    {day.bottleMl > 0 ? ` · ${day.bottleMl} ml` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="panel-title">Estimated wake &amp; sleep</h2>
        <p className="panel-copy">
          From the last {LOOKBACK_DAYS} days — how long she usually stays awake, and how long she
          usually sleeps, for the 1st, 2nd, 3rd… turn.
        </p>

        {estimateSlots.length === 0 ? (
          <p className="empty">
            Need a few sleeps logged on different days — then you'll see wake and sleep estimates.
          </p>
        ) : (
          <ul className="estimate-list">
            {estimateSlots.map((slot) => {
              const wake = slots.find((entry) => entry.slot === slot);
              const sleep = sleepSlots.find((entry) => entry.slot === slot);
              const live =
                openWindow?.slot === slot ||
                (napWindow !== null && napWindow.slot + 1 === slot && Boolean(activeSleep));
              return (
                <li
                  key={slot}
                  className={live ? 'estimate-row estimate-row--live' : 'estimate-row'}
                >
                  <div className="estimate-label">
                    <span>Turn {slot}</span>
                    <em>
                      {wake ? slotLabel(slot) : ''}
                      {wake && sleep ? ' · ' : ''}
                      {sleep ? sleepSlotLabel(slot) : ''}
                    </em>
                  </div>
                  <div className="estimate-pair">
                    {wake ? (
                      <strong className="estimate-value">~{formatDuration(wake.averageMs)}</strong>
                    ) : (
                      <strong className="estimate-value estimate-value--muted">—</strong>
                    )}
                    <span className="estimate-pair-label">awake</span>
                    {sleep ? (
                      <strong className="estimate-value estimate-value--sleep">
                        ~{formatDuration(sleep.averageMs)}
                      </strong>
                    ) : (
                      <strong className="estimate-value estimate-value--muted">—</strong>
                    )}
                    <span className="estimate-pair-label">sleep</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {openWindow && liveEstimate ? (
        <section className="estimate-card" aria-live="polite">
          <p className="estimate-card-label">
            {slotLabel(openWindow.slot)} · awake now
          </p>
          <strong className="estimate-card-timer">
            {formatStopwatch(openWindow.durationMs)}
          </strong>
          <p className="estimate-card-copy">
            Slept {formatDuration(openWindow.sleptBeforeMs)} before
            {sleepAverageMap.get(openWindow.slot)
              ? ` (usual sleep ~${formatDuration(sleepAverageMap.get(openWindow.slot)!)})`
              : ''}
            {' · '}
            usually ~{formatDuration(liveEstimate.estimatedMs)} awake
          </p>
          <p className="estimate-card-next">
            {liveEstimate.overdue
              ? `Past usual time — next sleep was around ${formatClock(liveEstimate.nextSleepAt)}`
              : `Next sleep around ${formatClock(liveEstimate.nextSleepAt)} · ${formatDuration(liveEstimate.remainingMs)} left`}
          </p>
        </section>
      ) : openWindow ? (
        <section className="estimate-card" aria-live="polite">
          <p className="estimate-card-label">{slotLabel(openWindow.slot)} · awake now</p>
          <strong className="estimate-card-timer">
            {formatStopwatch(openWindow.durationMs)}
          </strong>
          <p className="estimate-card-copy">
            Slept {formatDuration(openWindow.sleptBeforeMs)} before this wake
          </p>
        </section>
      ) : null}

      {activeSleep && liveSleepEstimate ? (
        <section className="estimate-card estimate-card--sleep" aria-live="polite">
          <p className="estimate-card-label">
            {sleepSlotLabel(
              napWindow ? napWindow.slot + 1 : 1,
            )}{' '}
            · sleeping now
          </p>
          <strong className="estimate-card-timer">
            {formatStopwatch(now - new Date(activeSleep.startedAt).getTime())}
          </strong>
          <p className="estimate-card-copy">
            Usually sleeps ~{formatDuration(liveSleepEstimate.estimatedMs)}
          </p>
          <p className="estimate-card-next">
            {liveSleepEstimate.overdue
              ? `Past usual — wake was around ${formatClock(liveSleepEstimate.wakeAt)}`
              : `Wake around ${formatClock(liveSleepEstimate.wakeAt)} · ${formatDuration(liveSleepEstimate.remainingMs)} left`}
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Today's wakes</h2>
          {currentlyAwake ? (
            <span className="sync-pill sync-pill--synced">Awake now</span>
          ) : activeSleep ? (
            <span className="sync-pill sync-pill--syncing">Sleeping</span>
          ) : null}
        </div>

        {todayWindows.length === 0 ? (
          <p className="empty">
            No wake windows yet today. Log a sleep and a wake-up — then you'll see how long she
            stayed awake until the next nap.
          </p>
        ) : (
          <ul className="wake-list">
            {todayWindows.map((window) => (
              <WindowRow
                key={`${window.startedAt}-${window.slot}`}
                window={window}
                averageMs={slotAverageMap.get(window.slot) ?? averages.overallMs}
                now={now}
              />
            ))}
          </ul>
        )}
      </section>

      {pastDays.length > 0 ? (
        <section className="panel">
          <h2 className="panel-title">Past wake days</h2>
          <div className="past-days">
            {pastDays.map((day) => (
              <div key={day.day} className="past-day">
                <div className="panel-head">
                  <h3 className="past-day-title">{dayLabel(day.day)}</h3>
                  <span className="panel-meta">
                    {day.windows.length} wake{day.windows.length === 1 ? '' : 's'} ·{' '}
                    {formatDuration(day.totalAwakeMs)} awake
                  </span>
                </div>
                <ul className="wake-list wake-list--compact">
                  {day.windows.map((window) => (
                    <WindowRow
                      key={`${window.startedAt}-${window.slot}`}
                      window={window}
                      averageMs={slotAverageMap.get(window.slot) ?? averages.overallMs}
                      now={now}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
