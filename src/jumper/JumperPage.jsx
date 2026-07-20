import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/react';
import Viewer from './pages/Viewer';
import Worlds from './pages/Worlds';
import './jumper.css';

// Tab entry for the ported VEX Match Jumper tool. Scopes nuqs' URL deep-linking
// to this subtree (the app's own router keys on pathname, which stays /jumper
// regardless of the query params nuqs writes). The Match Jumper / Worlds switch
// is a single button that lives inside the Viewer's sidebar (right of the player
// controls); the Worlds view gets a compact back button so Worlds.jsx stays
// untouched.
export default function JumperPage() {
  const [view, setView] = useState('jumper'); // 'jumper' | 'worlds'

  return (
    <section className="page jumper-root">
      <NuqsAdapter>
        {view === 'jumper' ? (
          <Viewer onGoToWorlds={() => setView('worlds')} />
        ) : (
          <>
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setView('jumper')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text)] transition-colors"
                title="Back to Match Jumper"
              >
                <ChevronLeft className="w-4 h-4" />
                Match Jumper
              </button>
            </div>
            <Worlds />
          </>
        )}
      </NuqsAdapter>
    </section>
  );
}
