import { useState } from 'react';
import { TodayView } from './components/TodayView';
import { HistoryView } from './components/HistoryView';
import { FamilyView } from './components/FamilyView';
import { EditEventSheet } from './components/EditEventSheet';
import { HomeIcon, ListIcon, UsersIcon } from './components/Icons';
import { useStore } from './lib/store';
import type { BabyEvent } from './lib/types';

type Tab = 'today' | 'history' | 'family';

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'today', label: 'Today', Icon: HomeIcon },
  { id: 'history', label: 'History', Icon: ListIcon },
  { id: 'family', label: 'Family', Icon: UsersIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [editing, setEditing] = useState<BabyEvent | null>(null);
  const { sync, pendingCount } = useStore();

  return (
    <div className="app">
      {sync === 'offline' ? (
        <p className="offline-bar">
          Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} will sync when you are
          back online.
        </p>
      ) : null}

      <main className="app-main">
        {tab === 'today' ? <TodayView onEdit={setEditing} /> : null}
        {tab === 'history' ? <HistoryView onEdit={setEditing} /> : null}
        {tab === 'family' ? <FamilyView /> : null}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'tab tab--on' : 'tab'}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <Icon width={24} height={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <EditEventSheet event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
