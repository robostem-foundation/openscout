import React, { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import { Play, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { getStreamStartTime } from '../services/youtube';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs) => twMerge(clsx(inputs));

const MatchPlayer = ({ videoId, matches, team }) => {
    const [player, setPlayer] = useState(null);
    const [streamStartTime, setStreamStartTime] = useState(null); // Epoch ms
    const [syncMode, setSyncMode] = useState(false);
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    const [autoSyncStatus, setAutoSyncStatus] = useState('idle'); // idle, loading, success, failed

    // Attempt Auto-Sync on mount
    useEffect(() => {
        const attemptAutoSync = async () => {
            setAutoSyncStatus('loading');
            const start = await getStreamStartTime(videoId);
            if (start) {
                setStreamStartTime(new Date(start).getTime());
                setAutoSyncStatus('success');
            } else {
                setAutoSyncStatus('failed');
            }
        };
        attemptAutoSync();
    }, [videoId]);

    const handleReady = (event) => {
        setPlayer(event.target);
    };

    const handleManualSync = (match) => {
        if (!player) return;
        const currentVideoTimeSec = player.getCurrentTime();
        const matchStartTimeMs = new Date(match.started).getTime();

        // Calculate Stream Start Time
        // StreamStart = MatchStart - VideoTime
        const calculatedStreamStart = matchStartTimeMs - (currentVideoTimeSec * 1000);
        setStreamStartTime(calculatedStreamStart);
        setSyncMode(false);
    };

    const jumpToMatch = (match) => {
        if (!player || !streamStartTime) return;

        const matchStartMs = new Date(match.started).getTime();
        const seekTimeSec = (matchStartMs - streamStartTime) / 1000;

        if (seekTimeSec < 0) {
            alert("This match happened before the stream started!");
            return;
        }

        player.seekTo(seekTimeSec, true);
        player.playVideo();
        setSelectedMatchId(match.id);
    };

    const adjustSync = (seconds) => {
        if (!streamStartTime) return;
        setStreamStartTime(prev => prev + (seconds * 1000));
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-4 animate-in fade-in duration-500">
            {/* Left: Player */}
            <div className="flex-1 bg-black rounded-lg overflow-hidden  relative group">
                <div className="absolute inset-0">
                    <YouTube
                        videoId={videoId}
                        opts={{
                            height: '100%',
                            width: '100%',
                            playerVars: {
                                autoplay: 1,
                                modestbranding: 1,
                            },
                        }}
                        onReady={handleReady}
                        className="h-full w-full"
                    />
                </div>

                {/* Sync Overlay */}
                {syncMode && (
                    <div className="absolute inset-0 bg-[var(--surface-2)]/80 z-10 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                        <h3 className="text-2xl font-semibold text-[var(--text)] mb-4">Manual Sync</h3>
                        <p className="text-[var(--text-2)] mb-8 max-w-md">
                            Find the exact moment <strong>{matches.find(m => m.id === selectedMatchId)?.name}</strong> starts in the video, then click the button below.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => handleManualSync(matches.find(m => m.id === selectedMatchId))}
                                className="bg-green-600 hover:bg-green-500 text-[var(--text)] px-8 py-3 rounded-full font-semibold text-lg transition-transform hover:scale-105"
                            >
                                SYNC NOW
                            </button>
                            <button
                                onClick={() => setSyncMode(false)}
                                className="bg-[var(--surface-3)] hover:bg-slate-600 text-[var(--text)] px-6 py-3 rounded-full font-semibold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right: Match List */}
            <div className="w-full lg:w-96 bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-lg flex flex-col backdrop-blur-sm">
                <div className="p-4 border-b border-[var(--border)]">
                    <h2 className="font-semibold text-[var(--text)] flex items-center justify-between">
                        <span>Matches for {team.number}</span>
                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full">
                            {matches.length} Matches
                        </span>
                    </h2>

                    {/* Sync Status Indicator */}
                    <div className="mt-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                streamStartTime ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"
                            )} />
                            <span className="text-[var(--text-muted)]">
                                {streamStartTime ? "Synced" : "Not Synced"}
                            </span>
                        </div>


                        {autoSyncStatus === 'failed' && !streamStartTime && (
                            <span className="text-orange-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Auto-sync unavailable
                            </span>
                        )}
                    </div>

                    {/* Fine Tune Controls */}
                    {streamStartTime && (
                        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                            <span className="text-xs text-[var(--text-muted)]">Fine Tune Sync:</span>
                            <div className="flex gap-1">
                                <button onClick={() => adjustSync(5)} className="px-2 py-1 bg-[var(--surface-3)] hover:bg-slate-600 rounded text-[10px] text-[var(--text)] transition-colors" title="Shift matches later">+5s</button>
                                <button onClick={() => adjustSync(1)} className="px-2 py-1 bg-[var(--surface-3)] hover:bg-slate-600 rounded text-[10px] text-[var(--text)] transition-colors" title="Shift matches later">+1s</button>
                                <button onClick={() => adjustSync(-1)} className="px-2 py-1 bg-[var(--surface-3)] hover:bg-slate-600 rounded text-[10px] text-[var(--text)] transition-colors" title="Shift matches earlier">-1s</button>
                                <button onClick={() => adjustSync(-5)} className="px-2 py-1 bg-[var(--surface-3)] hover:bg-slate-600 rounded text-[10px] text-[var(--text)] transition-colors" title="Shift matches earlier">-5s</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {matches.map((match) => {
                        const isSelected = selectedMatchId === match.id;
                        const hasStarted = !!match.started;

                        return (
                            <div
                                key={match.id}
                                className={cn(
                                    "p-3 rounded-lg border transition-all duration-200",
                                    isSelected
                                        ? "bg-blue-600/20 border-blue-500/50 "
                                        : "bg-[var(--surface)]/50 border-[var(--border)]/50 hover:bg-[var(--surface-2)]"
                                )}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-semibold text-[var(--text)]">{match.name}</h4>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {hasStarted ? format(new Date(match.started), 'h:mm a') : 'Scheduled'}
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                                        match.alliances.find(a => a.teams.some(t => t.team.id === team.id))?.color === 'red'
                                            ? "bg-red-500/20 text-red-400"
                                            : "bg-blue-500/20 text-blue-400"
                                    )}>
                                        {match.alliances.find(a => a.teams.some(t => t.team.id === team.id))?.color} Alliance
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-2">
                                    {streamStartTime ? (
                                        <button
                                            onClick={() => jumpToMatch(match)}
                                            disabled={!hasStarted}
                                            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-[var(--text)] text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                        >
                                            <Play className="w-3 h-3" /> JUMP
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setSelectedMatchId(match.id);
                                                setSyncMode(true);
                                            }}
                                            disabled={!hasStarted}
                                            className="flex-1 bg-[var(--surface-3)] hover:bg-slate-600 disabled:opacity-50 text-[var(--text)] text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" /> SYNC HERE
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// Helper icon
const AlertCircle = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
);

export default MatchPlayer;
