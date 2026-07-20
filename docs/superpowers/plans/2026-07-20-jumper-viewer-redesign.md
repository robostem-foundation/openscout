# Match Jumper Viewer Redesign — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This repo has **no test framework** (`vitest`/`jest`/etc. are absent). Verification is `npm run lint`, `tsc`/`vite build` via `npm run build`, and the live dev-server preview (Browser pane, `launch.json` name `dev`, port 5175). Do not invent unit tests.

**Goal:** Redesign the Match Jumper `Viewer` so the event search and livestream inputs live as two side-by-side cards below the video that smoothly resize (Find Event alone → shrinks as Livestream expands when an event loads), replace the livestream URL inputs with date-labelled YouTube pills + a single paste box, move the playback seek controls under the video, and remove the floating bottom-left buttons (keeping their code).

**Architecture:** All changes are confined to the Jumper subtree (`src/jumper/`). Two new presentational components — `SeekControls` (extracted playback strip) and `LivestreamPanel` (division selector + pill row + paste box) — are composed by `Viewer.jsx`, which is restructured to a new left-column layout. The existing `streams` state shape (`{id,url,videoId,streamStartTime,divisionId,dayIndex,label,date}`) and the match-jumping utilities (`findStreamForMatch`, `getGrayOutReason`, `getMatchDayIndex`) are reused unchanged — pills are simply a new view over the same streams, and pasted videos are auto-assigned to an event day via the detected `actualStartTime`.

**Tech Stack:** React 18 (`.jsx`), Vite, Tailwind (utility classes), lucide-react icons, `react-youtube`, `date-fns` (`format`), Geist design tokens (`--surface`, `--border`, `--text`, `--accent`, …).

## Global Constraints

- Stay within `src/jumper/`. Do not touch `Worlds.jsx` (VEX Worlds view is explicitly out of scope).
- Use existing Geist CSS variables only — no new colors or hardcoded hexes. Division toggle is tinted **purple** using the existing `purple-500/*` classes already used for divisions in this file.
- Keep removed code, don't delete it: floating buttons wrapped in `{false && …}`; `StreamManager.jsx` stays on disk but is no longer imported by `Viewer`.
- Theme-aware (light + dark) via tokens; smooth width animation must animate `transform`/`grid-template-columns` only (no layout thrash on scroll).
- No emojis in code/markup.

---

### Task 1: Remove floating bottom-left buttons (keep code)

**Files:**
- Modify: `src/jumper/pages/Viewer.jsx` (the `{/* Floating Controls (Bottom Left) */}` block, ~lines 1358-1375)

- [ ] **Step 1:** Wrap the entire `<div className="fixed bottom-4 left-4 z-40 flex gap-2">…</div>` block in `{false && ( … )}` so it no longer renders but the JSX (History + Clear All buttons) remains in the file. Add a comment `{/* Hidden per redesign; kept for easy restore */}`.
- [ ] **Step 2:** Confirm `handleClearAll` and `setShowEventHistory` are still referenced elsewhere (they are — deep-link clear + `EventHistory` modal), so no unused-var lint error is introduced.
- [ ] **Step 3:** `npm run lint` — expect no new errors.
- [ ] **Step 4:** Commit: `git add -A && git commit -m "Jumper: hide floating history/clear buttons (keep code)"`

---

### Task 2: Extract `SeekControls` component

**Files:**
- Create: `src/jumper/components/SeekControls.jsx`

**Interfaces:**
- Produces: `export default function SeekControls({ onSeek, onJumpToSyncedStart, canControl })`
  - `onSeek(seconds: number)` — nudges the active player.
  - `onJumpToSyncedStart()` — jumps to the currently-selected synced match.
  - `canControl: boolean` — dims + disables the strip when no active player.

- [ ] **Step 1:** Create the component using the seek/Synced markup currently inside `StreamManager` (the `feedback` pill + the `bg-[var(--surface-2)]/40 … rounded-lg p-1` control cluster with Rewind/ChevronsLeft/RotateCcw/ChevronLeft, Synced Play, ChevronRight/RotateCw/ChevronsRight/FastForward and their tiny labels). Keep the `triggerFeedback` local state + `@keyframes feedback-pill` style block. Render it as a self-contained horizontal strip (no title, no add-stream button).

```jsx
import React, { useState, useRef } from 'react';
import { Rewind, FastForward, RotateCcw, RotateCw, Play, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SeekControls({ onSeek, onJumpToSyncedStart, canControl }) {
    const [feedback, setFeedback] = useState(null);
    const feedbackTimeout = useRef(null);

    const triggerFeedback = (text, isPositive = true) => {
        if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
        setFeedback({ text, isPositive, key: Date.now() });
        feedbackTimeout.current = setTimeout(() => setFeedback(null), 1000);
    };
    const handleSeekClick = (seconds) => {
        onSeek(seconds);
        const sign = seconds > 0 ? '+' : '-';
        const absVal = Math.abs(seconds);
        triggerFeedback(absVal >= 60 ? `${sign}${absVal / 60}m` : `${sign}${absVal}s`, seconds > 0);
    };
    const handleSyncedClick = () => { onJumpToSyncedStart(); triggerFeedback('Synced!', true); };

    const btn = "p-1 hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg transition-colors";
    const lbl = "text-[7px] font-semibold text-[var(--text-faint)] uppercase tracking-wider -mt-0.5 pointer-events-none";
    const Group = ({ onClick, icon: Icon, label, title, accent }) => (
        <div className="flex flex-col items-center">
            <button onClick={onClick} className={accent ? "p-1 hover:bg-[var(--accent)]/20 text-[var(--accent)] rounded-lg transition-colors" : btn} title={title}>
                <Icon className={`w-3.5 h-3.5 ${accent ? 'fill-current' : ''}`} />
            </button>
            <span className={accent ? "text-[7px] font-semibold text-[var(--accent)]/70 uppercase tracking-wider -mt-0.5 pointer-events-none" : lbl}>{label}</span>
        </div>
    );

    return (
        <div className="relative group inline-flex">
            {feedback && (
                <div key={feedback.key} className={`absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full text-[10px] font-semibold z-50 animate-feedback-pill border border-white/10 ${feedback.isPositive ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>{feedback.text}</div>
            )}
            <div className={`flex items-center bg-[var(--surface-2)]/40 border border-[var(--border)] rounded-lg p-1 transition-all duration-300 ${canControl ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                <Group onClick={() => handleSeekClick(-60)} icon={Rewind} label="1M" title="Back 1m" />
                <Group onClick={() => handleSeekClick(-30)} icon={ChevronsLeft} label="30S" title="Back 30s" />
                <Group onClick={() => handleSeekClick(-10)} icon={RotateCcw} label="10S" title="Back 10s" />
                <Group onClick={() => handleSeekClick(-5)} icon={ChevronLeft} label="5S" title="Back 5s" />
                <div className="h-4 w-px bg-[var(--surface-2)] mx-1" />
                <Group onClick={handleSyncedClick} icon={Play} label="Synced" title="Jump to Synced Start" accent />
                <div className="h-4 w-px bg-[var(--surface-2)] mx-1" />
                <Group onClick={() => handleSeekClick(5)} icon={ChevronRight} label="5S" title="Forward 5s" />
                <Group onClick={() => handleSeekClick(10)} icon={RotateCw} label="10S" title="Forward 10s" />
                <Group onClick={() => handleSeekClick(30)} icon={ChevronsRight} label="30S" title="Forward 30s" />
                <Group onClick={() => handleSeekClick(60)} icon={FastForward} label="1M" title="Forward 1m" />
            </div>
            <style>{`@keyframes feedback-pill {0%{transform:translate(-50%,10px);opacity:0;scale:.8}15%{transform:translate(-50%,0);opacity:1;scale:1}85%{transform:translate(-50%,0);opacity:1;scale:1}100%{transform:translate(-50%,-10px);opacity:0;scale:.9}}.animate-feedback-pill{animation:feedback-pill 1s ease-out forwards}`}</style>
        </div>
    );
}
```

- [ ] **Step 2:** `npm run lint` — expect no errors for the new file.
- [ ] **Step 3:** Commit: `git add -A && git commit -m "Jumper: add SeekControls component (extracted playback strip)"`

---

### Task 3: Create `LivestreamPanel` (division selector + pills + paste box)

**Files:**
- Create: `src/jumper/components/LivestreamPanel.jsx`

**Interfaces:**
- Consumes: `extractVideoId`, `getStreamStartTime` from `../services/youtube`; `getMatchDayIndex` from `../utils/streamMatching`; `format` from `date-fns`.
- Produces: `export default function LivestreamPanel({ event, streams, onStreamsChange, multiDivisionMode, onMultiDivisionModeChange, activeDivisionId, onActiveDivisionIdChange })`

**Behavior:**
- **Division selector (top):** only when `event?.divisions?.length > 1`. A purple toggle (`multiDivisionMode` on/off) plus, when on, one purple pill-button per division setting `activeDivisionId` — reuse the exact class pattern already in `StreamManager`/`Viewer` for divisions (`bg-purple-500/20 text-purple-300 border border-purple-500/30`).
- **Target division** for rendering + paste: `multiDivisionMode ? activeDivisionId : (event?.divisions?.[0]?.id || 1)`.
- **Pill row (row 1):** render one `StreamPill` per stream in the target division that has a `videoId`. (Streams with `divisionId == null` — backups — always show.)
- **Paste box (row 2):** a single text input. On change, try `extractVideoId(value)`; if it yields an 11-char id, immediately (a) clear the input, (b) fill the target: find the first empty slot (`!videoId`) for the target division, set its `url`/`videoId` and `streamStartTime:null`; if no empty slot, append a new backup stream `{id:'stream-paste-'+Date.now(), url, videoId, streamStartTime:null, divisionId: targetDivisionId, dayIndex:null, label:''}`. If not a valid id, keep the raw text (so partial typing works).
- **Date detection effect:** identical pattern to `StreamManager`'s `fetchStreamTimes` — for each stream with `videoId && !streamStartTime` not already fetched, call `getStreamStartTime`; on `status==='started'`, set `streamStartTime` AND recompute `dayIndex = getMatchDayIndex(new Date(startTime).toISOString(), event.start)` and `label` (`'Day '+(dayIndex+1)`). This is what maps a pasted video to the right event day automatically. Track fetched ids in a `useRef(new Set())` to avoid refetch loops.
- **StreamPill:** shows the YouTube glyph + date. Date = `stream.streamStartTime ? format(new Date(stream.streamStartTime),'MMM d') : (loading ? '…' : 'Stream')`. On hover the pill expands to reveal **edit** (pencil) and **remove** (X) icons. Edit: call `onEdit(stream)` → parent greys the pill (`editingId`) and lifts `stream.url` back into the paste box, and clears the stream's `videoId`/`streamStartTime` (so it stops rendering as an active pill) — implement by setting the input value and removing the stream (backup) or clearing the slot. Remove (X): clear the slot's `url/videoId/streamStartTime` (keep the empty day slot) or drop the backup stream from the list.

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Youtube, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { extractVideoId, getStreamStartTime } from '../services/youtube';
import { getMatchDayIndex } from '../utils/streamMatching';

function StreamPill({ stream, loading, greyed, onEdit, onRemove }) {
    const dateLabel = stream.streamStartTime
        ? format(new Date(stream.streamStartTime), 'MMM d')
        : (loading ? 'Detecting' : 'Stream');
    const undated = !stream.streamStartTime && !loading;
    return (
        <div className={`group/pill relative inline-flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded-full border text-xs font-medium transition-all
            ${greyed ? 'opacity-40 border-dashed' : ''}
            bg-[var(--surface-2)]/60 border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]`}>
            <Youtube className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="tabular-nums whitespace-nowrap flex items-center gap-1">
                {loading && <Loader className="w-3 h-3 animate-spin text-[var(--accent)]" />}
                {dateLabel}
                {undated && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="No livestream start time detected — jumping requires manual sync" />}
            </span>
            {/* hover actions */}
            <span className="grid grid-cols-[0fr] group-hover/pill:grid-cols-[1fr] transition-all duration-200 overflow-hidden">
                <span className="flex items-center gap-0.5 min-w-0">
                    <button onClick={() => onEdit(stream)} title="Edit URL" className="p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)]"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => onRemove(stream)} title="Remove" className="p-0.5 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"><X className="w-3 h-3" /></button>
                </span>
            </span>
        </div>
    );
}

export default function LivestreamPanel({ event, streams, onStreamsChange, multiDivisionMode, onMultiDivisionModeChange, activeDivisionId, onActiveDivisionIdChange }) {
    const [pasteValue, setPasteValue] = useState('');
    const [loadingIds, setLoadingIds] = useState({});
    const [editingId, setEditingId] = useState(null);
    const fetched = useRef(new Set());

    const hasDivisions = event?.divisions?.length > 1;
    const targetDivisionId = multiDivisionMode && hasDivisions ? activeDivisionId : (event?.divisions?.[0]?.id || 1);

    const visibleStreams = streams.filter(s =>
        (s.divisionId === targetDivisionId || s.divisionId == null) && s.videoId
    );

    // Detect start time + day for any filled stream lacking it.
    useEffect(() => {
        const ids = streams.map(s => s.videoId).filter(Boolean).sort().join(',');
        const prev = Array.from(fetched.current).sort().join(',');
        if (ids !== prev) fetched.current = new Set([...fetched.current].filter(id => ids.includes(id)));

        streams.forEach(async (stream) => {
            if (!stream.videoId || stream.streamStartTime || fetched.current.has(stream.videoId) || loadingIds[stream.id]) return;
            fetched.current.add(stream.videoId);
            setLoadingIds(p => ({ ...p, [stream.id]: true }));
            try {
                const result = await getStreamStartTime(stream.videoId);
                if (result?.status === 'started' && result.startTime) {
                    const ms = new Date(result.startTime).getTime();
                    const dayIndex = event ? getMatchDayIndex(new Date(result.startTime).toISOString(), event.start) : stream.dayIndex;
                    onStreamsChange(prevS => prevS.map(s => s.id === stream.id
                        ? { ...s, streamStartTime: ms, dayIndex, label: `Day ${(dayIndex ?? 0) + 1}` } : s));
                }
            } catch (e) { /* leave undated; user can manual-sync */ }
            finally { setLoadingIds(p => ({ ...p, [stream.id]: false })); }
        });
    }, [streams.map(s => s.videoId).join(',')]);

    const fillWithVideo = (url, videoId) => {
        let placed = false;
        const next = streams.map(s => {
            if (!placed && !s.videoId && (s.divisionId === targetDivisionId || s.divisionId == null)) {
                placed = true;
                return { ...s, url, videoId, streamStartTime: null };
            }
            return s;
        });
        if (!placed) next.push({ id: `stream-paste-${Date.now()}`, url, videoId, streamStartTime: null, divisionId: targetDivisionId, dayIndex: null, label: '' });
        onStreamsChange(next);
    };

    const handlePaste = (value) => {
        const videoId = extractVideoId(value);
        if (videoId) { setPasteValue(''); fillWithVideo(value, videoId); }
        else setPasteValue(value);
    };

    const clearStream = (stream) => {
        // Empty a pre-generated day slot; drop an ad-hoc backup entirely.
        const isBackup = stream.id.startsWith('stream-paste-') || stream.id.startsWith('stream-backup-');
        onStreamsChange(prevS => isBackup
            ? prevS.filter(s => s.id !== stream.id)
            : prevS.map(s => s.id === stream.id ? { ...s, url: '', videoId: null, streamStartTime: null } : s));
    };
    const handleEdit = (stream) => { setPasteValue(stream.url || `https://www.youtube.com/watch?v=${stream.videoId}`); clearStream(stream); };

    return (
        <div className="space-y-3">
            {hasDivisions && (
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => onMultiDivisionModeChange(!multiDivisionMode)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded border transition-all whitespace-nowrap ${multiDivisionMode ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
                        {multiDivisionMode ? 'DIVISIONS: ON' : 'DIVISIONS: OFF'}
                    </button>
                    {multiDivisionMode && event.divisions.map(div => (
                        <button key={div.id} onClick={() => onActiveDivisionIdChange(div.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all ${activeDivisionId === div.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-[var(--surface-2)]/50 text-[var(--text-faint)] border border-transparent hover:bg-[var(--surface-3)]'}`}>
                            {div.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Row 1: pills */}
            <div className="flex flex-wrap items-center gap-2 min-h-[34px]">
                {visibleStreams.length > 0
                    ? visibleStreams.map(s => (
                        <StreamPill key={s.id} stream={s} loading={loadingIds[s.id]} greyed={editingId === s.id}
                            onEdit={handleEdit} onRemove={clearStream} />
                    ))
                    : <span className="text-xs text-[var(--text-faint)]">No streams yet — paste a YouTube link below.</span>}
            </div>

            {/* Row 2: paste box */}
            <input
                type="text"
                value={pasteValue}
                onChange={(e) => handlePaste(e.target.value)}
                onPaste={(e) => { const t = e.clipboardData.getData('text'); if (extractVideoId(t)) { e.preventDefault(); handlePaste(t); } }}
                placeholder="Paste a YouTube link…"
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
            />
        </div>
    );
}
```

- [ ] **Step 1:** Create the file above. Note `Youtube` is a valid lucide-react icon.
- [ ] **Step 2:** `npm run lint` — expect no errors.
- [ ] **Step 3:** Commit: `git add -A && git commit -m "Jumper: add LivestreamPanel (pills + paste box + division selector)"`

---

### Task 4: Restructure `Viewer` left column + wire new components

**Files:**
- Modify: `src/jumper/pages/Viewer.jsx`
  - Imports: add `SeekControls`, `LivestreamPanel`; keep `StreamManager` import removed (no longer used) — verify no other references.
  - Icons: drop now-unused imports (`LayoutList`, and any icon only used by the removed Find-Event heading) once the heading is gone; keep the rest. Run lint to catch leftovers.

**Interfaces:**
- Consumes: `SeekControls({onSeek, onJumpToSyncedStart, canControl})`, `LivestreamPanel({event, streams, onStreamsChange, multiDivisionMode, onMultiDivisionModeChange, activeDivisionId, onActiveDivisionIdChange})`.

- [ ] **Step 1: New left-column structure.** Replace the left column (`xl:col-span-8`) body so it is: (1) the existing video player block unchanged; (2) directly below it, a `SeekControls` strip shown only when `event && streams.length > 0`, wired to `handleSeek`, the existing `onJumpToSyncedStart` inline (find selected match → `jumpToMatch`), and `canControl={!!players[activeStreamId]}`; (3) a two-card grid:

```jsx
{/* Find Event + Livestream — animated two-card row */}
<div
  className="grid gap-4 transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
  style={{ gridTemplateColumns: event ? 'minmax(220px, 300px) 1fr' : '1fr 0fr' }}
>
  {/* Card A: Find Event (moved from right column) */}
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden min-w-0">
    {/* … Find Event content, see Step 2 … */}
  </div>
  {/* Card B: Livestream (empty/0-width until event) */}
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 min-w-0 overflow-hidden transition-opacity duration-300 ${event ? 'opacity-100' : 'opacity-0'}`}>
    {event && (
      webcastCandidates.length > 0
        ? <WebcastSelector candidates={webcastCandidates} onSelect={handleWebcastSelect} event={event} />
        : <LivestreamPanel event={event} streams={streams} onStreamsChange={setStreams}
            multiDivisionMode={multiDivisionMode} onMultiDivisionModeChange={setMultiDivisionMode}
            activeDivisionId={activeDivisionId} onActiveDivisionIdChange={setActiveDivisionId} />
    )}
    {/* keep the existing noWebcastsFound / showStreamSuccess helper lines below the panel */}
  </div>
</div>
```

- [ ] **Step 2: Move Find Event content into Card A.** Move the existing Find-Event markup (presets `<select>` "Featured Events", the "Search by URL" input + Search button, and the `event` summary block) out of the right column into Card A. **Remove** the `Find Event` heading text and its `LayoutList` icon. Keep the collapse mechanism but repurpose it: when `event` is set the card is in **compact** mode (show only the event name + venue + a small "Change" button that clears the compact state to reveal the search controls again); when no event, show the full search controls. Reuse existing `isEventSearchCollapsed` state (already auto-set true once an event loads, line ~171-175). Compact body:

```jsx
{event && isEventSearchCollapsed ? (
  <button onClick={() => setIsEventSearchCollapsed(false)} className="w-full text-left p-4 hover:bg-[var(--surface-2)]/50 transition-colors">
    <p className="text-[var(--text)] font-semibold text-sm line-clamp-2" title={event.name}>{event.name}</p>
    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">{event.location?.venue}{event.location?.city ? `, ${event.location.city}` : ''}</p>
    <span className="inline-block mt-2 text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">Change event</span>
  </button>
) : (
  <div className="p-4 space-y-4"> {/* presets select + URL search + summary, existing markup */} </div>
)}
```

- [ ] **Step 3: Right column — remove the Find Event card only.** Delete the moved Find-Event collapsible `<div>` from the right column (`xl:col-span-4`). Leave the `seg-toggle` tab bar and the entire tab panel (Find Team / Team List / Matches) intact. The right column now begins with the `seg-toggle`.
- [ ] **Step 4: Remove StreamManager usage.** Ensure the old `<StreamManager … />` / auto-detected `<h2>Livestream URL…</h2>` block and the empty-state "Livestream URLs" block (lines ~1495-1564) are gone (replaced by Card B). Remove the `StreamManager` import. Do **not** delete `StreamManager.jsx`.
- [ ] **Step 5:** `npm run lint` then `npm run build` — expect both to pass (build catches type/JSX errors). Fix any unused-import lint errors surfaced.
- [ ] **Step 6:** Commit: `git add -A && git commit -m "Jumper: restructure Viewer into animated two-card layout + wire new panels"`

---

### Task 5: Restyle right-column tabs to match Geist (light touch)

**Files:**
- Modify: `src/jumper/pages/Viewer.jsx` (right column tab panel headers/spacing only)

- [ ] **Step 1:** Verify the tab panel sits flush under the `seg-toggle` with consistent `gap`/margins now that Find Event is gone (adjust the `seg-toggle`'s `marginBottom` and the panel's top spacing if there's a visible gap). Keep borders/surfaces as the existing tokens. No functional changes.
- [ ] **Step 2:** Commit (if any change): `git add -A && git commit -m "Jumper: tidy right-column spacing after Find Event move"`

---

### Task 6: Verify in live preview + final pass

- [ ] **Step 1:** Start dev server (Browser pane, `preview_start {name:'dev'}`), navigate to the app, open the **Match Jumper** tab.
- [ ] **Step 2:** With **no event**: confirm only the Find Event card shows full-width below the video; Livestream card is collapsed (0 width); no floating buttons bottom-left.
- [ ] **Step 3:** Load an event (paste a RobotEvents URL or pick a Featured Event): confirm Find Event card **smoothly shrinks** and the Livestream card **smoothly expands** with padding between; Find Event card shows compact event summary with "Change event".
- [ ] **Step 4:** In the Livestream card: paste a YouTube livestream link → confirm the box clears and a pill appears with the YouTube glyph + detected date ("MMM d"); hover the pill → edit + X reveal; click edit → pill greys and URL returns to the box; click X → pill removed. For a multi-division event, confirm the purple division selector appears and pills are per-division.
- [ ] **Step 5:** Confirm the seek strip under the video nudges the player and the "Synced" button jumps; confirm keyboard J/K still work.
- [ ] **Step 6:** `read_console_messages` — no new errors. Check both light + dark (`resize_window` colorScheme).
- [ ] **Step 7:** Screenshot the no-event and event-loaded states to share with the user.
- [ ] **Step 8:** Final commit if any fixes: `git add -A && git commit -m "Jumper: preview fixes"`

---

## Self-Review

- **Spec coverage:** floating buttons hidden+kept (T1); two-card animated layout at livestream width (T4); Find Event heading/icon removed + compact shrunk card (T4 S2); "Livestream URLs" heading removed (T4 S4); pills w/ YT icon + date, no year (T3); paste→auto-pill w/ auto date-to-day matching (T3); hover edit/X, edit→grey+return-to-box (T3); events w/o day-1 stream → no day-1 pill (natural consequence of rendering only filled streams); division selector on top, purple, existing toggle (T3); seek controls relocated under video (T2+T4); right column keeps all three tabs, restyle only (T4 S3, T5); Worlds untouched (constraint); StreamManager kept on disk (T4 S4). ✔
- **Placeholder scan:** none — new-component code is complete; Viewer edits reference exact existing blocks by content + line ranges.
- **Type consistency:** `LivestreamPanel`/`SeekControls` prop names match the wiring in T4; `onStreamsChange` accepts both array and updater-fn forms (matches existing `setStreams` usage in `Viewer`). Pill date uses `streamStartTime` (ms) consistent with `StreamManager`.
- **Edge:** non-live VOD → `getStreamStartTime` returns null → pill shows "Stream" + yellow dot; jumping falls back to manual sync (existing behavior). Documented.
