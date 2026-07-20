import { useState } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/react';
import Viewer from './pages/Viewer';
import Worlds from './pages/Worlds';
import './jumper.css';

// Tab entry for the ported VEX Match Jumper tool. Wraps the tool's two views in
// OpenScout's page shell + segmented markup, and scopes nuqs' URL deep-linking
// to this subtree (the app's own router keys on pathname, which stays /jumper
// regardless of the query params nuqs writes).
export default function JumperPage() {
  const [view, setView] = useState('jumper'); // 'jumper' | 'worlds'

  return (
    <section className="page jumper-root">
      <div className="seg-toggle jumper-seg-compact" role="tablist" aria-label="Jumper mode">
        <button role="tab" aria-selected={view === 'jumper'} className={view === 'jumper' ? 'active' : ''} onClick={() => setView('jumper')}>
          Match Jumper
        </button>
        <button role="tab" aria-selected={view === 'worlds'} className={view === 'worlds' ? 'active' : ''} onClick={() => setView('worlds')}>
          VEX Worlds
        </button>
      </div>

      <NuqsAdapter>
        {view === 'jumper' ? <Viewer /> : <Worlds />}
      </NuqsAdapter>
    </section>
  );
}
