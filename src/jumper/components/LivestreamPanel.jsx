import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Youtube, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { extractVideoId, getStreamStartTime } from '../services/youtube';
import { getMatchDayIndex } from '../utils/streamMatching';

/**
 * A single livestream, shown as a compact pill: YouTube glyph + detected date
 * (e.g. "Jul 17"). Hovering expands the pill to reveal edit + remove actions.
 */
function StreamPill({ stream, loading, greyed, onEdit, onRemove }) {
    const dateLabel = stream.streamStartTime
        ? format(new Date(stream.streamStartTime), 'MMM d')
        : (loading ? 'Detecting' : 'Stream');
    const undated = !stream.streamStartTime && !loading;

    return (
        <div className={`group/pill relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all bg-[var(--surface-2)]/60 border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)] ${greyed ? 'opacity-40 border-dashed' : ''}`}>
            <Youtube className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="tabular-nums whitespace-nowrap flex items-center gap-1">
                {loading && <Loader className="w-3 h-3 animate-spin text-[var(--accent)]" />}
                {dateLabel}
                {undated && (
                    <span
                        className="w-1.5 h-1.5 rounded-full bg-yellow-500"
                        title="No livestream start time detected — jumping to matches will need a manual sync"
                    />
                )}
            </span>
            {/* Hover actions: width animates from 0 -> auto so the pill "expands" */}
            <span className="grid grid-cols-[0fr] group-hover/pill:grid-cols-[1fr] transition-all duration-200 overflow-hidden">
                <span className="flex items-center gap-0.5 min-w-0">
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
            </span>
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

    const handlePaste = (value) => {
        const videoId = extractVideoId(value);
        if (videoId) {
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
        } else {
            setPasteValue(value);
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

    // Edit: grey the pill and lift its URL back into the paste box. Submitting a
    // new link replaces it; blurring the box without a change cancels the edit.
    const handleEdit = (stream) => {
        setEditingId(stream.id);
        setPasteValue(stream.url || `https://www.youtube.com/watch?v=${stream.videoId}`);
    };

    const handleBlur = () => {
        if (editingId && !extractVideoId(pasteValue)) {
            setEditingId(null);
            setPasteValue('');
        }
    };

    return (
        <div className="space-y-3">
            {/* Division selector — the division names themselves are the toggle */}
            {hasDivisions && (
                <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-1">
                    {event.divisions.map(div => {
                        const active = targetDivisionId === div.id;
                        return (
                            <button
                                key={div.id}
                                onClick={() => onActiveDivisionIdChange(div.id)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${active
                                    ? 'bg-purple-600 text-white'
                                    : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]'}`}
                            >
                                {div.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Row 1: stream pills */}
            <div className="flex flex-wrap items-center gap-2 min-h-[34px]">
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

            {/* Row 2: paste box */}
            <input
                type="text"
                value={pasteValue}
                onChange={(e) => handlePaste(e.target.value)}
                onPaste={(e) => {
                    const t = e.clipboardData.getData('text');
                    if (extractVideoId(t)) { e.preventDefault(); handlePaste(t); }
                }}
                onBlur={handleBlur}
                placeholder={editingId ? 'Paste the corrected YouTube link…' : 'Paste a YouTube link…'}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
            />
        </div>
    );
}
