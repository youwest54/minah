import { DIAPER_LABEL, FEED_METHOD_LABEL } from '../lib/events';
import type { BreastSide, DiaperKind, EventDetails, FeedMethod } from '../lib/types';

interface FieldProps {
  details: EventDetails;
  onChange: (next: EventDetails) => void;
}

const FEED_METHODS: FeedMethod[] = ['bottle', 'breast', 'solid'];
const SIDES: BreastSide[] = ['left', 'right', 'both'];
const DIAPER_KINDS: DiaperKind[] = ['wet', 'dirty', 'mixed'];
const COMMON_AMOUNTS = [60, 90, 120, 150, 180];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'chip chip--on' : 'chip'}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function FeedFields({ details, onChange }: FieldProps) {
  return (
    <>
      <div className="field">
        <span className="field-label">
          How was the feed? <em>optional</em>
        </span>
        <div className="chip-row">
          {FEED_METHODS.map((method) => (
            <Chip
              key={method}
              label={FEED_METHOD_LABEL[method]}
              active={details.method === method}
              onClick={() =>
                onChange(
                  details.method === method
                    ? { ...details, method: undefined, amountMl: undefined, side: undefined }
                    : { ...details, method, amountMl: undefined, side: undefined },
                )
              }
            />
          ))}
        </div>
      </div>

      {details.method === 'bottle' ? (
        <div className="field">
          <span className="field-label">
            How much? <em>ml</em>
          </span>
          <div className="chip-row">
            {COMMON_AMOUNTS.map((amount) => (
              <Chip
                key={amount}
                label={String(amount)}
                active={details.amountMl === amount}
                onClick={() =>
                  onChange({
                    ...details,
                    amountMl: details.amountMl === amount ? undefined : amount,
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {details.method === 'breast' ? (
        <div className="field">
          <span className="field-label">Which side?</span>
          <div className="chip-row">
            {SIDES.map((side) => (
              <Chip
                key={side}
                label={side === 'both' ? 'Both' : side === 'left' ? 'Left' : 'Right'}
                active={details.side === side}
                onClick={() =>
                  onChange({ ...details, side: details.side === side ? undefined : side })
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DiaperFields({ details, onChange }: FieldProps) {
  return (
    <div className="field">
      <span className="field-label">What was it?</span>
      <div className="chip-row">
        {DIAPER_KINDS.map((kind) => (
          <Chip
            key={kind}
            label={DIAPER_LABEL[kind]}
            active={details.kind === kind}
            onClick={() => onChange({ ...details, kind: details.kind === kind ? undefined : kind })}
          />
        ))}
      </div>
    </div>
  );
}

export function NoteFields({ details, onChange }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor="note-text">
        What happened?
      </label>
      <textarea
        id="note-text"
        rows={3}
        placeholder="Medicine, temperature, mood…"
        value={details.text ?? ''}
        onChange={(event) => onChange({ ...details, text: event.target.value })}
      />
    </div>
  );
}
