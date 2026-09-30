import { useMemo } from 'react';
import { EventList } from './EventList';
import { useStore } from '../lib/store';
import { useNow } from '../hooks/useNow';
import { dayKey, dayLabel, formatDuration } from '../lib/time';
import { sleepDurationMs } from '../lib/events';
import type { BabyEvent } from '../lib/types';

export function HistoryView({ onEdit }: { onEdit: (event: BabyEvent) => void }) {
  const { events } = useStore();
  const now = useNow(30_000);

  const days = useMemo(() => {
    const grouped = new Map<string, BabyEvent[]>();
    for (const event of events) {
      const key = dayKey(event.startedAt);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  return (
    <div className="view">
      <header className="greeting">
        <p>Everything logged</p>
        <h1>History</h1>
      </header>

      {days.length === 0 ? (
        <p className="empty">No entries yet.</p>
      ) : (
        days.map(([key, dayEvents]) => {
          const feeds = dayEvents.filter((event) => event.type === 'feed').length;
          const diapers = dayEvents.filter((event) => event.type === 'diaper').length;
          const sleep = dayEvents
            .filter((event) => event.type === 'sleep')
            .reduce((total, event) => total + sleepDurationMs(event, now), 0);

          return (
            <section className="panel" key={key}>
              <div className="panel-head">
                <h2 className="panel-title">{dayLabel(key)}</h2>
                <span className="panel-meta">
                  {feeds} {feeds === 1 ? 'feed' : 'feeds'} ·{' '}
                  {sleep > 0 ? formatDuration(sleep) : '0m'} sleep · {diapers}{' '}
                  {diapers === 1 ? 'diaper' : 'diapers'}
                </span>
              </div>
              <EventList events={dayEvents} onSelect={onEdit} />
            </section>
          );
        })
      )}
    </div>
  );
}
