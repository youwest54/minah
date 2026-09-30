import { useEffect, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { ClockIcon } from './Icons';
import { useNow } from '../hooks/useNow';
import { formatClock, fromLocalInput, minutesAgo, toLocalInput } from '../lib/time';

const QUICK_OFFSETS = [5, 15, 30, 60];

interface WhenSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Blocks times before this instant, e.g. a wake-up can't precede falling asleep. */
  minTime?: Date | null;
  /** Set false while a required detail (like note text) is still empty. */
  canSave?: boolean;
  /** Optional detail controls rendered above the time choices. */
  children?: ReactNode;
  onPick: (when: Date) => void;
  onClose: () => void;
}

/**
 * Every log passes through here so the answer to "was this now, or earlier?" is
 * always explicit — one tap for now, two for a time you already missed.
 */
export function WhenSheet({
  open,
  title,
  subtitle,
  minTime,
  canSave = true,
  children,
  onPick,
  onClose,
}: WhenSheetProps) {
  const now = useNow(10_000);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState(() => toLocalInput(new Date()));
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setShowPicker(false);
      setPickerValue(toLocalInput(new Date()));
      setProblem(null);
    }
  }, [open]);

  function reject(when: Date): string | null {
    if (when.getTime() > Date.now() + 60_000) {
      return 'That time is in the future.';
    }
    if (minTime && when.getTime() < minTime.getTime()) {
      return `Needs to be after ${formatClock(minTime.toISOString())}.`;
    }
    return null;
  }

  function submit(when: Date) {
    const issue = reject(when);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    onPick(when);
  }

  return (
    <Sheet open={open} title={title} subtitle={subtitle} onClose={onClose}>
      {children ? <div className="sheet-extra">{children}</div> : null}

      <button
        type="button"
        className="when-now"
        disabled={!canSave}
        onClick={() => submit(new Date())}
      >
        <span className="when-now-label">Now</span>
        <span className="when-now-time">{formatClock(new Date(now).toISOString())}</span>
      </button>

      <div className="when-divider">
        <span>or it happened earlier</span>
      </div>

      <div className="when-quick">
        {QUICK_OFFSETS.map((offset) => {
          const target = minutesAgo(offset);
          return (
            <button
              key={offset}
              type="button"
              className="when-chip"
              disabled={!canSave}
              onClick={() => submit(minutesAgo(offset))}
            >
              <span className="when-chip-main">
                {offset === 60 ? '1 hour ago' : `${offset} min ago`}
              </span>
              <span className="when-chip-sub">{formatClock(target.toISOString())}</span>
            </button>
          );
        })}
      </div>

      {showPicker ? (
        <div className="when-picker">
          <label htmlFor="when-exact">Exact time</label>
          <input
            id="when-exact"
            type="datetime-local"
            value={pickerValue}
            max={toLocalInput(new Date())}
            onChange={(event) => setPickerValue(event.target.value)}
          />
          <button
            type="button"
            className="button-primary"
            disabled={!canSave}
            onClick={() => {
              const parsed = fromLocalInput(pickerValue);
              if (!parsed) {
                setProblem('Please choose a valid time.');
                return;
              }
              submit(parsed);
            }}
          >
            Save this time
          </button>
        </div>
      ) : (
        <button type="button" className="button-ghost" onClick={() => setShowPicker(true)}>
          <ClockIcon width={18} height={18} />
          Pick another time
        </button>
      )}

      {problem ? <p className="sheet-problem">{problem}</p> : null}
    </Sheet>
  );
}
