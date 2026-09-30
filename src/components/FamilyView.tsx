import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon, UsersIcon } from './Icons';
import { useStore } from '../lib/store';

const SYNC_COPY = {
  synced: 'All changes saved',
  syncing: 'Saving…',
  offline: 'Offline — saved on this phone, will sync later',
  'local-only': 'Saved on this phone only',
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
    cloudConfigured,
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
  const [busy, setBusy] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => setNameDraft(household.babyName), [household.babyName]);
  useEffect(() => setShowInstall(!isStandalone()), []);

  async function copyCode() {
    if (!household.joinCode) return;
    try {
      await navigator.clipboard.writeText(household.joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function shareCode() {
    if (!household.joinCode) return;
    const text = `Join me on Minah to track ${household.babyName}. Our code is ${household.joinCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Minah', text });
      } catch {
        // User dismissed the share sheet.
      }
    } else {
      await copyCode();
    }
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    await task();
    setBusy(false);
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
              Anyone who enters this code sees the same entries as you, live.
            </p>
            <div className="code-display">
              <strong>{household.joinCode}</strong>
              <button type="button" className="icon-button" onClick={copyCode} aria-label="Copy code">
                {copied ? <CheckIcon width={20} height={20} /> : <CopyIcon width={20} height={20} />}
              </button>
            </div>
            <button type="button" className="button-primary" onClick={shareCode}>
              <UsersIcon width={18} height={18} />
              Share this code
            </button>
            <button
              type="button"
              className="button-ghost"
              disabled={busy}
              onClick={() => void run(leaveHousehold)}
            >
              Stop sharing on this phone
            </button>
          </>
        ) : cloudConfigured ? (
          <>
            <p className="panel-copy">
              Create a shared space to log together with your partner, or enter the code they
              already have. Everything on this phone comes with you.
            </p>
            <button
              type="button"
              className="button-primary"
              disabled={busy}
              onClick={() => void run(() => createHousehold(household.babyName))}
            >
              Create a shared space
            </button>
            <div className="inline-form">
              <input
                type="text"
                value={code}
                placeholder="6-character code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                aria-label="Join code"
              />
              <button
                type="button"
                className="button-primary compact"
                disabled={busy || code.trim().length < 6}
                onClick={() => void run(() => joinHousehold(code))}
              >
                Join
              </button>
            </div>
          </>
        ) : (
          <p className="panel-copy">
            Sharing needs Supabase keys in <code>.env.local</code>. Until then everything is saved
            safely on this phone.
          </p>
        )}

        {error ? (
          <p className="sheet-problem" onClick={clearError} role="alert">
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
