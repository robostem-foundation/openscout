// The Worlds video player, copied from the Jumper Worlds page (src/jumper/pages/
// Worlds.jsx). Worlds streams are BoxCast HLS rather than YouTube, so there is no
// embed with built-in controls — this renders a bare <video> driven by hls.js and
// overlays its own scrub bar, volume, captions and fullscreen controls.
//
// `mediaRef` hands the underlying <video> element back to the caller so the match
// video modal's own seek buttons and note timestamps can drive the same element.
// Keep in sync with the Worlds page copy.

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

function formatTimecode(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export default function WorldsHlsPlayer({ src, seekRequest, mediaRef }) {
    const fallbackVideoRef = useRef(null);
    const videoRef = mediaRef ?? fallbackVideoRef;
    const hlsRef = useRef(null);
    const wrapperRef = useRef(null);
    const hideTimeoutRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [hasCaptions, setHasCaptions] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage?.getItem('worlds:captionsOn') === '1';
    });

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            hlsRef.current = hls;
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
            hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) console.error('[HLS]', d.type, d.details); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            video.play().catch(() => {});
        }
        return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    }, [src]);

    useEffect(() => {
        if (!seekRequest || seekRequest.time <= 0) return;
        const video = videoRef.current;
        if (!video) return;
        const doSeek = () => { video.currentTime = seekRequest.time; video.play().catch(() => {}); };
        if (video.readyState >= 1) doSeek();
        else video.addEventListener('loadedmetadata', doSeek, { once: true });
    }, [seekRequest]);

    // Sync player state from the video element (so custom controls stay current
    // when something outside this component toggles play/pause/seek/volume).
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTime = () => setCurrentTime(video.currentTime);
        const onMeta = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
        const onVol = () => { setMuted(video.muted); setVolume(video.volume); };
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTime);
        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('durationchange', onMeta);
        video.addEventListener('volumechange', onVol);
        setMuted(video.muted);
        setVolume(video.volume);
        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('durationchange', onMeta);
            video.removeEventListener('volumechange', onVol);
        };
    }, []);

    useEffect(() => {
        const onFs = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const tracks = video.textTracks;
        if (!tracks) return;
        const applyDesiredMode = () => {
            let found = false;
            for (let i = 0; i < tracks.length; i++) {
                const t = tracks[i];
                if (t.kind === 'subtitles' || t.kind === 'captions') {
                    found = true;
                    const desired = captionsOn ? 'showing' : 'disabled';
                    if (t.mode !== desired) t.mode = desired;
                }
            }
            setHasCaptions(found);
        };
        const syncFromTracks = () => {
            let found = false;
            let anyShowing = false;
            for (let i = 0; i < tracks.length; i++) {
                const t = tracks[i];
                if (t.kind === 'subtitles' || t.kind === 'captions') {
                    found = true;
                    if (t.mode === 'showing') anyShowing = true;
                }
            }
            setHasCaptions(found);
            setCaptionsOn(anyShowing);
        };
        applyDesiredMode();
        const onAdd = () => applyDesiredMode();
        const onRemove = () => applyDesiredMode();
        const onChange = () => syncFromTracks();
        tracks.addEventListener?.('addtrack', onAdd);
        tracks.addEventListener?.('removetrack', onRemove);
        tracks.addEventListener?.('change', onChange);
        return () => {
            tracks.removeEventListener?.('addtrack', onAdd);
            tracks.removeEventListener?.('removetrack', onRemove);
            tracks.removeEventListener?.('change', onChange);
        };
    }, [src, captionsOn]);

    const toggleCaptions = useCallback(() => {
        setCaptionsOn((on) => {
            const next = !on;
            try { window.localStorage?.setItem('worlds:captionsOn', next ? '1' : '0'); } catch {}
            return next;
        });
    }, []);

    const scheduleHide = useCallback(() => {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
            const v = videoRef.current;
            if (v && !v.paused) setControlsVisible(false);
        }, 2500);
    }, []);

    const showControls = useCallback(() => {
        setControlsVisible(true);
        scheduleHide();
    }, [scheduleHide]);

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
    }, []);

    const toggleMute = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            wrapperRef.current?.requestFullscreen?.().catch(() => {});
        }
    }, []);

    const onScrub = (e) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Number(e.target.value);
    };

    const onVolumeInput = (e) => {
        const v = videoRef.current;
        if (!v) return;
        const next = Number(e.target.value);
        v.volume = next;
        v.muted = next === 0;
    };

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumePct = Math.round((muted ? 0 : volume) * 100);

    return (
        <div
            ref={wrapperRef}
            className="relative w-full h-full bg-black select-none"
            onMouseMove={showControls}
            onMouseLeave={() => { const v = videoRef.current; if (v && !v.paused) setControlsVisible(false); }}
        >
            <video
                ref={videoRef}
                className="w-full h-full bg-black"
                style={{ display: 'block' }}
                onClick={togglePlay}
                playsInline
            />

            <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent h-24 transition-opacity duration-200 ${controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0'}`}
            />

            <div
                className={`absolute inset-x-0 bottom-0 px-3 pb-2 pt-1 transition-opacity duration-200 ${controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={onScrub}
                    aria-label="Seek"
                    className="w-full h-1.5 cursor-pointer appearance-none rounded-full outline-none"
                    style={{ background: `linear-gradient(to right, #4FCEEC ${progressPct}%, rgba(255,255,255,0.3) ${progressPct}%)` }}
                />

                <div className="flex items-center gap-2 mt-1 text-white">
                    <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title={isPlaying ? 'Pause (k)' : 'Play (k)'}>
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <span className="text-[11px] font-mono tabular-nums text-gray-200">
                        {formatTimecode(currentTime)} / {formatTimecode(duration)}
                    </span>

                    <div className="group/vol flex items-center gap-1">
                        <button onClick={toggleMute} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title={muted ? 'Unmute (m)' : 'Mute (m)'}>
                            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={muted ? 0 : volume}
                            onChange={onVolumeInput}
                            aria-label="Volume"
                            className="w-0 group-hover/vol:w-16 focus:w-16 h-1 cursor-pointer appearance-none rounded-full outline-none transition-all overflow-hidden"
                            style={{ background: `linear-gradient(to right, #fff ${volumePct}%, rgba(255,255,255,0.3) ${volumePct}%)` }}
                        />
                    </div>

                    <div className="flex-1" />

                    {hasCaptions && (
                        <button
                            onClick={toggleCaptions}
                            className="p-1.5 hover:bg-white/10 rounded-md transition-colors flex items-center"
                            title={captionsOn ? 'Hide captions (c)' : 'Show captions (c)'}
                        >
                            <span
                                className={`text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-sm border transition-colors ${captionsOn ? 'bg-white text-black border-white' : 'text-white border-white/70'}`}
                            >
                                CC
                            </span>
                        </button>
                    )}

                    <button onClick={toggleFullscreen} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title={isFullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}>
                        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
