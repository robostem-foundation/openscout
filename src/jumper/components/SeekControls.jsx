import React, { useState, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

/**
 * SeekControls — slim playback bar for the top of the right sidebar.
 * Text-based ± steps flanking a plain play/pause button that toggles the
 * active player.
 */
export default function SeekControls({ onSeek, onTogglePlay, isPlaying, canControl }) {
    const [feedback, setFeedback] = useState(null);
    const feedbackTimeout = useRef(null);

    const triggerFeedback = (text, isPositive = true) => {
        if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
        setFeedback({ text, isPositive, key: Date.now() });
        feedbackTimeout.current = setTimeout(() => setFeedback(null), 1000);
    };
    const handleSeekClick = (seconds) => {
        onSeek(seconds);
        const sign = seconds > 0 ? '+' : '−';
        const absVal = Math.abs(seconds);
        triggerFeedback(absVal >= 60 ? `${sign}${absVal / 60}m` : `${sign}${absVal}s`, seconds > 0);
    };

    const steps = [-60, -30, -10, -5, 5, 10, 30, 60];
    const stepLabel = (s) => (Math.abs(s) >= 60 ? `${Math.abs(s) / 60}m` : `${Math.abs(s)}s`);

    const SeekBtn = ({ seconds }) => (
        <button
            onClick={() => handleSeekClick(seconds)}
            title={`${seconds < 0 ? 'Back' : 'Forward'} ${stepLabel(seconds)}`}
            className="px-1.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
        >
            {seconds < 0 ? '−' : '+'}{stepLabel(seconds)}
        </button>
    );

    const Divider = () => <div className="mx-0.5 h-5 w-px bg-[var(--border)] flex-shrink-0" />;

    return (
        <div className="relative inline-flex">
            {feedback && (
                <div
                    key={feedback.key}
                    className={`absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-md text-[10px] font-semibold z-[500] animate-feedback-pill border border-white/10 ${feedback.isPositive ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}
                >
                    {feedback.text}
                </div>
            )}
            <div className={`inline-flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-1 transition-opacity duration-300 ${canControl ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                {steps.slice(0, 4).map((s) => <SeekBtn key={s} seconds={s} />)}
                <Divider />
                <button
                    onClick={onTogglePlay}
                    title={isPlaying ? 'Pause' : 'Play'}
                    className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors"
                >
                    {isPlaying
                        ? <Pause className="w-4 h-4 fill-current" />
                        : <Play className="w-4 h-4 fill-current" />}
                </button>
                <Divider />
                {steps.slice(4).map((s) => <SeekBtn key={s} seconds={s} />)}
            </div>
            <style>{`@keyframes feedback-pill {0%{transform:translate(-50%,10px);opacity:0;scale:.8}15%{transform:translate(-50%,0);opacity:1;scale:1}85%{transform:translate(-50%,0);opacity:1;scale:1}100%{transform:translate(-50%,-10px);opacity:0;scale:.9}}.animate-feedback-pill{animation:feedback-pill 1s ease-out forwards}`}</style>
        </div>
    );
}
