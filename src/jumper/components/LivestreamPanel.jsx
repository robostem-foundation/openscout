import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Loader, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { extractVideoId, getStreamStartTime } from '../services/youtube';
import { getMatchDayIndex } from '../utils/streamMatching';

/** The real YouTube logo mark (red rounded-rect + white play triangle). */
function YouTubeLogo({ className = '' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
            <path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    );
}

/**
 * A single livestream, shown as a compact pill: YouTube glyph + detected date
 * (e.g. "Jul 17"). Hovering expands the pill to reveal edit + remove actions.
 */
function StreamPill({ stream, loading, greyed, onEdit, onRemove }) {
    const synced = !!stream.streamStartTime;
    const dateLabel = synced
        ? format(new Date(stream.streamStartTime), 'MMM d')
        : (loading ? 'Detecting' : 'Stream');
    const link = stream.url || (stream.videoId ? `https://www.youtube.com/watch?v=${stream.videoId}` : null);
    const [copied, setCopied] = useState(false);
    const copyLink = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard unavailable */ }
    };

    return (
        <div className={`group/pill flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all bg-[var(--surface-2)]/60 border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)] ${greyed ? 'opacity-40 border-dashed' : ''}`}>
            <YouTubeLogo className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="tabular-nums whitespace-nowrap font-semibold flex-shrink-0">{dateLabel}</span>
            {link && (
                <button
                    onClick={copyLink}
                    title={copied ? 'Copied!' : 'Copy link'}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
            )}
            {link && (
                <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 truncate font-normal text-[var(--text-muted)] hover:text-[var(--text)] underline-offset-2 hover:underline"
                >
                    {link}
                </a>
            )}
            {/* Sync status at the edge; edit/remove slide in on hover, easing it left */}
            <div className="flex items-center flex-shrink-0">
                {loading ? (
                    <Loader className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                ) : (
                    <span
                        className={`w-2 h-2 rounded-full ${synced ? 'bg-green-500' : 'bg-yellow-500'}`}
                        title={synced ? 'Synced — livestream start time detected' : 'Not synced — no start time detected; jumping will need a manual sync'}
                    />
                )}
                <div className="grid grid-cols-[0fr] group-hover/pill:grid-cols-[1fr] transition-[grid-template-columns] duration-200 ease-out">
                    <div className="overflow-hidden">
                        <span className="flex items-center gap-0.5 pl-1.5">
                            <button
                                onClick={() => onEdit(stream)}
                                title="Edit URL"
                                className="p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                                <Pencil className="w-3 h-3" />
                            </button>
                            <button
                                onClick={() => onRemove(stream)}
                                title="Remove"
                                className="p-0.5 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * LivestreamPanel — replaces the old per-day URL inputs with a pill row + a
 * single paste box. Pasting a YouTube link auto-detects the video's start
 * time and assigns it to the matching event day (no manual day picking).
 *
 * For multi-division events a purple division selector sits on top and the
 * pills / paste target the selected division.
 */
export default function LivestreamPanel({
    event,
    streams,
    onStreamsChange,
    multiDivisionMode,
    onMultiDivisionModeChange,
    activeDivisionId,
    onActiveDivisionIdChange,
}) {
    const [pasteValue, setPasteValue] = useState('');
    const [loadingIds, setLoadingIds] = useState({});
    const [editingId, setEditingId] = useState(null);
    const fetched = useRef(new Set());

    const hasDivisions = event?.divisions?.length > 1;
    const targetDivisionId = hasDivisions
        ? (activeDivisionId || event.divisions[0].id)
        : (event?.divisions?.[0]?.id || 1);

    const visibleStreams = streams.filter(s =>
        (s.divisionId === targetDivisionId || s.divisionId == null) && s.videoId
    );

    // Detect start time + event day for any filled stream that lacks it.
    useEffect(() => {
        const ids = streams.map(s => s.videoId).filter(Boolean);
        // Drop cached ids that are no longer present (e.g. after removal).
        fetched.current = new Set([...fetched.current].filter(id => ids.includes(id)));

        streams.forEach(async (stream) => {
            if (!stream.videoId || stream.streamStartTime || fetched.current.has(stream.videoId) || loadingIds[stream.id]) return;
            fetched.current.add(stream.videoId);
            setLoadingIds(p => ({ ...p, [stream.id]: true }));
            try {
                const result = await getStreamStartTime(stream.videoId);
                if (result?.status === 'started' && result.startTime) {
                    const ms = new Date(result.startTime).getTime();
                    const dayIndex = event
                        ? getMatchDayIndex(new Date(result.startTime).toISOString(), event.start)
                        : stream.dayIndex;
                    onStreamsChange(prevS => prevS.map(s => s.id === stream.id
                        ? { ...s, streamStartTime: ms, dayIndex, label: `Day ${(dayIndex ?? 0) + 1}` }
                        : s));
                }
            } catch (e) {
                // Leave the stream undated; the user can still manual-sync it.
            } finally {
                setLoadingIds(p => ({ ...p, [stream.id]: false }));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streams.map(s => s.videoId).join(',')]);

    // Fill the first empty slot for the target division, or append a backup.
    const fillWithVideo = (url, videoId) => {
        let placed = false;
        const next = streams.map(s => {
            if (!placed && !s.videoId && (s.divisionId === targetDivisionId || s.divisionId == null)) {
                placed = true;
                return { ...s, url, videoId, streamStartTime: null };
            }
            return s;
        });
        if (!placed) {
            next.push({
                id: `stream-paste-${Date.now()}`,
                url,
                videoId,
                streamStartTime: null,
                divisionId: targetDivisionId,
                dayIndex: null,
                label: '',
            });
        }
        onStreamsChange(next);
    };

    // Explicit submit — triggered by the Add Link / Confirm button or Enter.
    // No auto-recognition on typing/paste, so editing is never "sticky".
    const submitLink = () => {
        const value = pasteValue.trim();
        const videoId = extractVideoId(value);
        if (!videoId) return;
        if (editingId) {
            // Replace the pill currently being edited, in place.
            const target = editingId;
            setEditingId(null);
            setPasteValue('');
            onStreamsChange(prevS => prevS.map(s => s.id === target
                ? { ...s, url: value, videoId, streamStartTime: null }
                : s));
        } else {
            setPasteValue('');
            fillWithVideo(value, videoId);
        }
    };

    const clearStream = (stream) => {
        if (editingId === stream.id) setEditingId(null);
        // Empty a pre-generated day slot; drop an ad-hoc backup entirely.
        const isBackup = stream.id.startsWith('stream-paste-') || stream.id.startsWith('stream-backup-');
        onStreamsChange(prevS => isBackup
            ? prevS.filter(s => s.id !== stream.id)
            : prevS.map(s => s.id === stream.id ? { ...s, url: '', videoId: null, streamStartTime: null } : s));
    };

    // Edit: grey the pill and lift its URL back into the paste box. Confirm
    // replaces it; Cancel exits edit mode, leaving the original untouched.
    const handleEdit = (stream) => {
        setEditingId(stream.id);
        setPasteValue(stream.url || `https://www.youtube.com/watch?v=${stream.videoId}`);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setPasteValue('');
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Division selector — the division names themselves are the toggle */}
            {hasDivisions && (
                <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-0.5">
                    {event.divisions.map(div => {
                        const active = targetDivisionId === div.id;
                        return (
                            <button
                                key={div.id}
                                onClick={() => onActiveDivisionIdChange(div.id)}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${active
                                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                                    : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]'}`}
                            >
                                {div.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Stream pills — one per row; each card holds its clickable YouTube link */}
            <div className="flex flex-col gap-2 min-h-[32px]">
                {visibleStreams.length > 0
                    ? visibleStreams.map(s => (
                        <StreamPill
                            key={s.id}
                            stream={s}
                            loading={loadingIds[s.id]}
                            greyed={editingId === s.id}
                            onEdit={handleEdit}
                            onRemove={clearStream}
                        />
                    ))
                    : <span className="text-xs text-[var(--text-faint)]">No streams yet — paste a YouTube link below.</span>}
            </div>

            {/* Row 2: paste box + action buttons (Add Link, or Confirm / Cancel while
                editing). mt-auto pins it to the bottom of the livestream card. */}
            <div className="flex gap-2 mt-auto">
                <input
                    type="text"
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitLink(); }
                        else if (e.key === 'Escape' && editingId) cancelEdit();
                    }}
                    placeholder={editingId ? 'Paste the corrected YouTube link…' : 'Paste a YouTube link…'}
                    className="flex-1 min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                />
                {editingId ? (
                    <>
                        <button
                            onClick={submitLink}
                            disabled={!extractVideoId(pasteValue)}
                            className="flex-shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--accent-ink)] px-3 py-2 rounded-lg font-semibold text-sm transition-colors"
                        >
                            Confirm
                        </button>
                        <button
                            onClick={cancelEdit}
                            className="flex-shrink-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 rounded-lg font-semibold text-sm transition-colors"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        onClick={submitLink}
                        disabled={!extractVideoId(pasteValue)}
                        className="flex-shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--accent-ink)] px-3 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
                    >
                        Add Link
                    </button>
                )}
            </div>
        </div>
    );
}
