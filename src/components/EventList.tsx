import { BottleIcon, ChevronIcon, DiaperIcon, MoonIcon, NoteIcon } from './Icons';
import { eventTitle } from '../lib/events';
import { formatClock } from '../lib/time';
import type { BabyEvent, EventType } from '../lib/types';

function TypeIcon({ type }: { type: EventType }) {
  const size = 20;
  switch (type) {
    case 'feed':
      return <BottleIcon width={size} height={size} />;
    case 'sleep':
      return <MoonIcon width={size} height={size} />;
    case 'diaper':
      return <DiaperIcon width={size} height={size} />;
    case 'note':
      return <NoteIcon width={size} height={size} />;
  }
}

function timeSummary(event: BabyEvent): string {
  if (event.type !== 'sleep') return formatClock(event.startedAt);
  if (!event.endedAt) return `since ${formatClock(event.startedAt)}`;
  return `${formatClock(event.startedAt)} – ${formatClock(event.endedAt)}`;
}

interface EventListProps {
  events: BabyEvent[];
  onSelect: (event: BabyEvent) => void;
}

export function EventList({ events, onSelect }: EventListProps) {
  return (
    <ul className="event-list">
      {events.map((event) => (
        <li key={event.id}>
          <button type="button" className="event" onClick={() => onSelect(event)}>
            <span className={`event-icon event-icon--${event.type}`}>
              <TypeIcon type={event.type} />
            </span>
            <span className="event-main">
              <span className="event-title">{eventTitle(event)}</span>
              <span className="event-sub">{timeSummary(event)}</span>
            </span>
            <ChevronIcon className="event-chevron" width={16} height={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
