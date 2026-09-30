import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { DiaperFields, FeedFields, NoteFields } from './DetailFields';
import { TrashIcon } from './Icons';
import { useStore } from '../lib/store';
import { TYPE_LABEL } from '../lib/events';
import { fromLocalInput, toLocalInput } from '../lib/time';
import type { BabyEvent, EventDetails } from '../lib/types';

interface EditEventSheetProps {
  event: BabyEvent | null;
  onClose: () => void;
}

export function EditEventSheet({ event, onClose }: EditEventSheetProps) {
  const { updateEvent, deleteEvent } = useStore();
  const [startValue, setStartValue] = useState('');
  const [endValue, setEndValue] = useState('');
  const [details, setDetails] = useState<EventDetails>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!event) return;
    setStartValue(toLocalInput(new Date(event.startedAt)));
    setEndValue(event.endedAt ? toLocalInput(new Date(event.endedAt)) : '');
    setDetails(event.details);
    setProblem(null);
    setConfirmDelete(false);
  }, [event]);

  if (!event) return null;

  const isSleep = event.type === 'sleep';

  function save() {
    if (!event) return;
    const start = fromLocalInput(startValue);
    if (!start) {
      setProblem('Please choose a valid start time.');
      return;
    }
    let end: Date | null = null;
    if (isSleep && endValue) {
      end = fromLocalInput(endValue);
      if (!end) {
        setProblem('Please choose a valid wake-up time.');
        return;
      }
      if (end.getTime() <= start.getTime()) {
        setProblem('Wake-up has to come after falling asleep.');
        return;
      }
    }
    updateEvent(event.id, { startedAt: start, endedAt: isSleep ? end : undefined, details });
    onClose();
  }

  return (
    <Sheet open title={`Edit ${TYPE_LABEL[event.type].toLowerCase()}`} onClose={onClose}>
      <div className="field">
        <label className="field-label" htmlFor="edit-start">
          {isSleep ? 'Fell asleep' : 'Time'}
        </label>
        <input
          id="edit-start"
          type="datetime-local"
          value={startValue}
          onChange={(e) => setStartValue(e.target.value)}
        />
      </div>

      {isSleep ? (
        <div className="field">
          <label className="field-label" htmlFor="edit-end">
            Woke up <em>{endValue ? '' : 'still sleeping'}</em>
          </label>
          <input
            id="edit-end"
            type="datetime-local"
            value={endValue}
            onChange={(e) => setEndValue(e.target.value)}
          />
        </div>
      ) : null}

      {event.type === 'feed' ? <FeedFields details={details} onChange={setDetails} /> : null}
      {event.type === 'diaper' ? <DiaperFields details={details} onChange={setDetails} /> : null}
      {event.type === 'note' ? <NoteFields details={details} onChange={setDetails} /> : null}

      {problem ? <p className="sheet-problem">{problem}</p> : null}

      <button type="button" className="button-primary" onClick={save}>
        Save changes
      </button>

      {confirmDelete ? (
        <div className="confirm-row">
          <p>Delete this entry?</p>
          <div className="confirm-actions">
            <button type="button" className="button-ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => {
                deleteEvent(event.id);
                onClose();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button-ghost" onClick={() => setConfirmDelete(true)}>
          <TrashIcon width={18} height={18} />
          Delete entry
        </button>
      )}
    </Sheet>
  );
}
