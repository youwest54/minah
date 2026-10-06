import { useMemo } from 'react';
import { MoonIcon, SunIcon } from './Icons';
import { useStore } from '../lib/store';
import { useNow } from '../hooks/useNow';
import { dayKey, dayLabel, formatClock, formatDuration, formatStopwatch } from '../lib/time';
import {
  buildWakeWindows,
  isLongGap,
  periodAverages,
  slotAverages,
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
    ? `${formatDuration(abs)} longer than average`
    : `${formatDuration(abs)} shorter than average`;
}

function WindowRow({
  window,
  averageMs,
}: {
  window: WakeWindow;
  averageMs: number | null;
}) {
  const longGap = isLongGap(window);
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
          {window.open ? <em> awake now</em> : null}
        </strong>
        <span className="wake-range">
          Woke {formatClock(window.startedAt)}
          {window.endedAt ? ` → slept ${formatClock(window.endedAt)}` : ' → still awake'}
        </span>
        {longGap ? (
          <span className="wake-compare">Long gap — a sleep may be missing</span>
        ) : null}
        {compare ? <span className="wake-compare">{compare}</span> : null}
      </div>
    </li>
  );
}

export function OverviewView() {
  const { household, events, activeSleep } = useStore();
  const now = useNow(1000);

  const windows = useMemo(() => buildWakeWindows(events, now), [events, now]);
  const averages = useMemo(() => periodAverages(windows, LOOKBACK_DAYS, now), [windows, now]);
  const slots = useMemo(() => slotAverages(windows, LOOKBACK_DAYS, now), [windows, now]);
  const todayKey = dayKey(new Date(now).toISOString());
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

  const currentlyAwake = !activeSleep && todayWindows.some((window) => window.open);

  return (
    <div className="view">
      <header className="greeting">
        <p>Wake windows for {household.babyName}</p>
        <h1>Overview</h1>
      </header>

      <section className="summary" aria-label="Averages over the past week">
        <div className="summary-item">
          <strong>
            {averages.morningMs !== null ? formatDuration(averages.morningMs) : '—'}
          </strong>
          <span>morning avg</span>
        </div>
        <div className="summary-item">
          <strong>
            {averages.afternoonMs !== null ? formatDuration(averages.afternoonMs) : '—'}
          </strong>
          <span>after noon avg</span>
        </div>
        <div className="summary-item">
          <strong>
            {averages.overallMs !== null ? formatDuration(averages.overallMs) : '—'}
          </strong>
          <span>overall avg</span>
        </div>
      </section>

      <p className="overview-hint">
        Based on {averages.overallCount} wake
        {averages.overallCount === 1 ? '' : 's'} over the last {LOOKBACK_DAYS} days. Morning =
        woke before 12:00, after noon = woke from 12:00 on.
      </p>

      {slots.length > 0 ? (
        <section className="panel">
          <h2 className="panel-title">Usual wake length by turn</h2>
          <p className="panel-copy">
            How long she usually stays awake for the 1st, 2nd, 3rd… stretch of the day.
          </p>
          <ul className="slot-list">
            {slots.map((slot) => (
              <li key={slot.slot} className="slot-row">
                <span>{slotLabel(slot.slot)}</span>
                <strong>{formatDuration(slot.averageMs)}</strong>
                <em>
                  {slot.count} day{slot.count === 1 ? '' : 's'}
                </em>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Today</h2>
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
              />
            ))}
          </ul>
        )}
      </section>

      {pastDays.length > 0 ? (
        <section className="panel">
          <h2 className="panel-title">Past days</h2>
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
