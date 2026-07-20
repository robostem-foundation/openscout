import React, { useState, useRef } from 'react';
import { Rewind, FastForward, RotateCcw, RotateCw, Play, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * SeekControls — slim playback strip that sits directly beneath the video.
 * Extracted from the old StreamManager header so the seek/Synced controls
 * live next to the video they control instead of inside the livestream card.
 */
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
            <button
                onClick={onClick}
                className={accent ? "p-1 hover:bg-[var(--accent)]/20 text-[var(--accent)] rounded-lg transition-colors" : btn}
                title={title}
            >
                <Icon className={`w-3.5 h-3.5 ${accent ? 'fill-current' : ''}`} />
            </button>
            <span className={accent ? "text-[7px] font-semibold text-[var(--accent)]/70 uppercase tracking-wider -mt-0.5 pointer-events-none" : lbl}>{label}</span>
        </div>
    );

    return (
        <div className="relative group inline-flex">
            {feedback && (
                <div
                    key={feedback.key}
                    className={`absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full text-[10px] font-semibold z-50 animate-feedback-pill border border-white/10 ${feedback.isPositive ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}
                >
                    {feedback.text}
                </div>
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
