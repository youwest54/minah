import { useState } from 'react';
import { WhenSheet } from './WhenSheet';
import { EventList } from './EventList';
import { DiaperFields, FeedFields, NoteFields } from './DetailFields';
import { BottleIcon, DiaperIcon, MoonIcon, NoteIcon, SunIcon } from './Icons';
import { useStore } from '../lib/store';
import { useNow } from '../hooks/useNow';
import { isSameDay, sleepDurationMs } from '../lib/events';
import { formatAgo, formatClock, formatDuration, formatStopwatch, startOfDay } from '../lib/time';
import type { BabyEvent, EventDetails } from '../lib/types';

type Action = 'feed' | 'sleep' | 'wake' | 'diaper' | 'note';

const SHEET_COPY: Record<Action, { title: string; subtitle: string }> = {
  feed: { title: 'Feed', subtitle: 'Is this happening now, or did it already happen?' },
  sleep: { title: 'Fell asleep', subtitle: 'Just now, or earlier?' },
  wake: { title: 'Woke up', subtitle: 'Just now, or earlier?' },
  diaper: { title: 'Diaper change', subtitle: 'Just now, or earlier?' },
  note: { title: 'Note', subtitle: 'When did this happen?' },
};

/** Sleep can cross midnight, so count only the part that lands inside the day. */
function sleepOverlapMs(event: BabyEvent, dayStart: number, dayEnd: number, now: number): number {
  const start = Math.max(new Date(event.startedAt).getTime(), dayStart);
  const end = Math.min(event.endedAt ? new Date(event.endedAt).getTime() : now, dayEnd);
  return Math.max(0, end - start);
}

function greeting(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TodayView({ onEdit }: { onEdit: (event: BabyEvent) => void }) {
  const { household, events, activeSleep, addEvent, updateEvent } = useStore();
  const now = useNow(1000);
  const [action, setAction] = useState<Action | null>(null);
  const [details, setDetails] = useState<EventDetails>({});
  const [toast, setToast] = useState<string | null>(null);

  const today = new Date(now);
  const dayStart = startOfDay(today).getTime();
  const dayEnd = dayStart + 86_400_000;

  const todaysEvents = events.filter((event) => isSameDay(event.startedAt, today));
  const feedsToday = todaysEvents.filter((event) => event.type === 'feed');
  const diapersToday = todaysEvents.filter((event) => event.type === 'diaper');
  const sleepToday = events
    .filter((event) => event.type === 'sleep')
    .reduce((total, event) => total + sleepOverlapMs(event, dayStart, dayEnd, now), 0);

  const lastFeed = events.find((event) => event.type === 'feed');
  const lastDiaper = events.find((event) => event.type === 'diaper');
  const lastSleep = events.find((event) => event.type === 'sleep' && event.endedAt !== null);

  function open(next: Action) {
    setDetails({});
    setAction(next);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function handlePick(when: Date) {
    if (!action) return;

    switch (action) {
      case 'feed':
        addEvent({ type: 'feed', startedAt: when, details });
        showToast(`Feed saved · ${formatClock(when.toISOString())}`);
        break;
      case 'sleep':
        addEvent({ type: 'sleep', startedAt: when, endedAt: null });
        showToast(`Sleep started · ${formatClock(when.toISOString())}`);
        break;
      case 'wake':
        if (activeSleep) {
          updateEvent(activeSleep.id, { endedAt: when });
          const slept = when.getTime() - new Date(activeSleep.startedAt).getTime();
          showToast(`Slept ${formatDuration(slept)}`);
        }
        break;
      case 'diaper':
        addEvent({ type: 'diaper', startedAt: when, details });
        showToast(`Diaper saved · ${formatClock(when.toISOString())}`);
        break;
      case 'note':
        addEvent({ type: 'note', startedAt: when, details });
        showToast('Note saved');
        break;
    }

    setAction(null);
    setDetails({});
  }

  const noteReady = action !== 'note' || (details.text?.trim().length ?? 0) > 0;

  return (
    <div className="view">
      <header className="greeting">
        <p>{greeting(today.getHours())}</p>
        <h1>{household.babyName}</h1>
      </header>

      {activeSleep ? (
        <section className="sleeping-card">
          <div className="sleeping-copy">
            <span className="sleeping-label">
              <MoonIcon width={16} height={16} />
              Sleeping since {formatClock(activeSleep.startedAt)}
            </span>
            <strong className="sleeping-timer">
              {formatStopwatch(sleepDurationMs(activeSleep, now))}
            </strong>
          </div>
          <button type="button" className="wake-button" onClick={() => open('wake')}>
            <SunIcon width={22} height={22} />
            Wake up
          </button>
        </section>
      ) : null}

      <section className="actions" aria-label="Log an activity">
        <button type="button" className="action action--feed" onClick={() => open('feed')}>
          <BottleIcon className="action-icon" width={34} height={34} />
          <span className="action-label">Feed</span>
          <span className="action-hint">
            {lastFeed ? formatAgo(lastFeed.startedAt, now) : 'nothing yet'}
          </span>
        </button>

        {activeSleep ? (
          <button type="button" className="action action--wake" onClick={() => open('wake')}>
            <SunIcon className="action-icon" width={34} height={34} />
            <span className="action-label">Wake up</span>
            <span className="action-hint">{formatStopwatch(sleepDurationMs(activeSleep, now))}</span>
          </button>
        ) : (
          <button type="button" className="action action--sleep" onClick={() => open('sleep')}>
            <MoonIcon className="action-icon" width={34} height={34} />
            <span className="action-label">Sleep</span>
            <span className="action-hint">
              {lastSleep?.endedAt ? formatAgo(lastSleep.endedAt, now) : 'nothing yet'}
            </span>
          </button>
        )}

        <button type="button" className="action action--diaper" onClick={() => open('diaper')}>
          <DiaperIcon className="action-icon" width={34} height={34} />
          <span className="action-label">Diaper</span>
          <span className="action-hint">
            {lastDiaper ? formatAgo(lastDiaper.startedAt, now) : 'nothing yet'}
          </span>
        </button>

        <button type="button" className="action action--note" onClick={() => open('note')}>
          <NoteIcon className="action-icon" width={34} height={34} />
          <span className="action-label">Note</span>
          <span className="action-hint">anything else</span>
        </button>
      </section>

      <section className="summary" aria-label="Today so far">
        <div className="summary-item">
          <strong>{feedsToday.length}</strong>
          <span>feeds</span>
        </div>
        <div className="summary-item">
          <strong>{sleepToday > 0 ? formatDuration(sleepToday) : '—'}</strong>
          <span>sleep</span>
        </div>
        <div className="summary-item">
          <strong>{diapersToday.length}</strong>
          <span>diapers</span>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Today</h2>
        {todaysEvents.length === 0 ? (
          <p className="empty">Nothing logged yet today. Tap a button above to start.</p>
        ) : (
          <EventList events={todaysEvents} onSelect={onEdit} />
        )}
      </section>

      <WhenSheet
        open={action !== null}
        title={action ? SHEET_COPY[action].title : ''}
        subtitle={action ? SHEET_COPY[action].subtitle : undefined}
        minTime={action === 'wake' && activeSleep ? new Date(activeSleep.startedAt) : null}
        canSave={noteReady}
        onPick={handlePick}
        onClose={() => {
          setAction(null);
          setDetails({});
        }}
      >
        {action === 'feed' ? <FeedFields details={details} onChange={setDetails} /> : null}
        {action === 'diaper' ? <DiaperFields details={details} onChange={setDetails} /> : null}
        {action === 'note' ? <NoteFields details={details} onChange={setDetails} /> : null}
      </WhenSheet>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
