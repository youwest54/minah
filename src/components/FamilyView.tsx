import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon, UsersIcon } from './Icons';
import { useStore } from '../lib/store';

const JOIN_CODE_LENGTH = 8;

const SYNC_COPY = {
  synced: 'Saved for both of you',
  syncing: 'Saving…',
  offline: 'Offline — saved here, will sync later',
  'local-only': 'This phone only',
} as const;

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari on iOS reports Home Screen apps through a non-standard flag.
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function FamilyView() {
  const {
    household,
    sync,
    pendingCount,
    busy,
    error,
    clearError,
    setBabyName,
    createHousehold,
    joinHousehold,
    leaveHousehold,
  } = useStore();

  const [nameDraft, setNameDraft] = useState(household.babyName);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => setNameDraft(household.babyName), [household.babyName]);
  useEffect(() => setShowInstall(!isStandalone()), []);

  const joinLink = household.joinCode
    ? `${window.location.origin}/#join=${household.joinCode}`
    : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function shareLink() {
    const text = `Open this to follow ${household.babyName} with me on Minah`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Minah', text, url: joinLink });
        return;
      } catch {
        // Share sheet dismissed; fall through to copying.
      }
    }
    await copyLink();
  }

  return (
    <div className="view">
      <header className="greeting">
        <p>Settings &amp; sharing</p>
        <h1>Family</h1>
      </header>

      <section className="panel">
        <h2 className="panel-title">Baby's name</h2>
        <div className="inline-form">
          <input
            type="text"
            value={nameDraft}
            maxLength={24}
            onChange={(event) => setNameDraft(event.target.value)}
            aria-label="Baby's name"
          />
          <button
            type="button"
            className="button-primary compact"
            disabled={nameDraft.trim() === household.babyName}
            onClick={() => setBabyName(nameDraft)}
          >
            Save
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Sharing</h2>
          <span className={`sync-pill sync-pill--${sync}`}>
            {SYNC_COPY[sync]}
            {household.cloud && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </span>
        </div>

        {household.cloud ? (
          <>
            <p className="panel-copy">
              Send this link to your wife. When she opens it on her iPhone she joins
              automatically and you both see the same history.
            </p>

            <button type="button" className="button-primary" onClick={shareLink}>
              <UsersIcon width={18} height={18} />
              Share the link
            </button>

            <button type="button" className="button-ghost" onClick={copyLink}>
              {copied ? <CheckIcon width={18} height={18} /> : <CopyIcon width={18} height={18} />}
              {copied ? 'Link copied' : 'Copy the link'}
            </button>

            <p className="panel-copy">
              Or she can type this code in the box on her Family page:
            </p>
            <div className="code-display">
              <strong>{household.joinCode}</strong>
            </div>

            {confirmLeave ? (
              <div className="confirm-row">
                <p>Stop following this family on this phone? The history stays on the server.</p>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => setConfirmLeave(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => {
                      leaveHousehold();
                      setConfirmLeave(false);
                    }}
                  >
                    Stop
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button-ghost"
                onClick={() => setConfirmLeave(true)}
              >
                Stop sharing on this phone
              </button>
            )}
          </>
        ) : (
          <>
            <p className="panel-copy">
              Right now entries are only on this phone. Start a family to keep the history on
              the server and share it — everything you already logged comes with you.
            </p>
            <button
              type="button"
              className="button-primary"
              disabled={busy}
              onClick={() => void createHousehold(household.babyName)}
            >
              <UsersIcon width={18} height={18} />
              {busy ? 'Setting up…' : 'Start our family'}
            </button>

            <div className="when-divider">
              <span>or join one that already exists</span>
            </div>

            <div className="inline-form">
              <input
                type="text"
                value={code}
                placeholder={`${JOIN_CODE_LENGTH}-character code`}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={JOIN_CODE_LENGTH}
                // Tolerate a code pasted with spaces around or inside it.
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/\s/g, ''))
                }
                aria-label="Join code"
              />
              <button
                type="button"
                className="button-primary compact"
                disabled={busy || code.length < JOIN_CODE_LENGTH}
                onClick={() => void joinHousehold(code)}
              >
                Join
              </button>
            </div>
          </>
        )}

        {error ? (
          <p className="sheet-problem" role="alert" onClick={clearError}>
            {error}
          </p>
        ) : null}
      </section>

      {showInstall ? (
        <section className="panel">
          <h2 className="panel-title">Put it on your Home Screen</h2>
          <p className="panel-copy">
            In Safari, tap the Share button, then <strong>Add to Home Screen</strong>. Minah then
            opens full screen like a normal app and works without signal.
          </p>
        </section>
      ) : null}
    </div>
  );
}
