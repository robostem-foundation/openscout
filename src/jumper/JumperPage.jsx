import { ChevronLeft } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { useQueryState } from 'nuqs';
import Viewer from './pages/Viewer';
import Worlds from './pages/Worlds';
import './jumper.css';

// Tab entry for the ported VEX Match Jumper tool. Scopes nuqs' URL deep-linking
// to this subtree (the app's own router keys on pathname, which stays /jumper
// regardless of the query params nuqs writes).
export default function JumperPage() {
  return (
    <section className="page jumper-root">
      <NuqsAdapter>
        <JumperViews />
      </NuqsAdapter>
    </section>
  );
}

// The Match Jumper / Worlds switch is a single button inside the Viewer's sidebar
// (right of the player controls); the Worlds view gets a compact back button so
// Worlds.jsx stays untouched.
//
// Which view is showing lives in `?view` rather than component state so the event
// pages can deep-link straight into Worlds for a given program/year/division —
// see the Jumper link in each match table's header.
function JumperViews() {
  const [view, setView] = useQueryState('view');

  if (view !== 'worlds') {
    return <Viewer onGoToWorlds={() => setView('worlds', { history: 'push' })} />;
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setView(null, { history: 'push' })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text)] transition-colors"
          title="Back to Match Jumper"
        >
          <ChevronLeft className="w-4 h-4" />
          Match Jumper
        </button>
      </div>
      <Worlds />
    </>
  );
}
