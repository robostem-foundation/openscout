import React, { useState, useEffect, useRef } from 'react';
import { Play, RefreshCw, Loader, History, AlertCircle, Tv, Zap, ChevronDown, ChevronUp, Star, Link, RotateCcw, Search, Globe, CheckCircle2, Share2 } from 'lucide-react';
import YouTube from 'react-youtube';
import { format } from 'date-fns';
import { useQueryState } from 'nuqs';
import WebcastSelector from '../components/WebcastSelector';
import EventHistory from '../components/EventHistory';
import SeekControls from '../components/SeekControls';
import LivestreamPanel from '../components/LivestreamPanel';
import TeamList from '../components/TeamList';
import {
    getEventBySku,
    getTeamByNumber,
    getMatchesForEventAndTeam,
    getTeamsForEvent,
    getMatchesForEvent, // Import the new function
    getRankingsForEvent,
    getSkillsForEvent,
    getEventsForTeam,
    getActiveSeasons
} from '../services/robotevents';
import { extractVideoId, getStreamStartTime } from '../services/youtube';
import { findWebcastCandidates } from '../services/webcastDetection';
import { getCachedWebcast, setCachedWebcast, saveEventToHistory } from '../services/eventCache';
import { calculateEventDays, getMatchDayIndex, findStreamForMatch, getGrayOutReason, inferMatchDayFromContext } from '../utils/streamMatching';
import { parseCalendarDate } from '../utils/dateUtils';

// Helper to auto-detect streams or fallback to defaults
async function detectOrFallbackStreams(event, divisions) {
    let newStreams = [];

    // 1. Try Auto-Detect API
    try {
        console.log('[AUTO-DETECT] Checking for streams...');
        // Routed through OpenScout's jumper proxy (-> jumper.robostem.org/api/*).
        const streamRes = await fetch(`/api/jumper/detect-streams?sku=${event.sku}&eventStart=${event.start}&eventEnd=${event.end}&divisions=${encodeURIComponent(JSON.stringify(divisions))}`);

        if (streamRes.ok) {
            const streamData = await streamRes.json();
            if (streamData.streams && streamData.streams.length > 0) {
                console.log(`[AUTO-DETECT] Found ${streamData.streams.length} streams`, streamData.streams);
                newStreams = streamData.streams;
            }
        } else {
            console.warn(`[AUTO-DETECT] API returned status ${streamRes.status}`);
        }
    } catch (err) {
        console.error('[AUTO-DETECT] Failed', err);
    }

    // 2. Fallback: Manual Default Generation if no streams found
    if (newStreams.length === 0) {
        const days = calculateEventDays(event.start, event.end);

        divisions.forEach(division => {
            for (let i = 0; i < days; i++) {
                const eventStartDate = parseCalendarDate(event.start);
                const dayDate = new Date(eventStartDate);
                dayDate.setDate(eventStartDate.getDate() + i);
                const dateLabel = format(dayDate, 'MMM d');

                newStreams.push({
                    id: `stream-div-${division.id}-day-${i}`,
                    url: '',
                    videoId: null,
                    streamStartTime: null,
                    divisionId: division.id,
                    dayIndex: i,
                    label: days > 1 ? `Day ${i + 1} - ${dateLabel}` : 'Livestream',
                    date: dayDate.toISOString()
                });
            }
        });
    }

    return newStreams;
}

function Viewer({ onGoToWorlds }) {
    const [showEventHistory, setShowEventHistory] = useState(false);
    const [webcastCandidates, setWebcastCandidates] = useState([]);
    const [showStreamSuccess, setShowStreamSuccess] = useState(false); // Popup state
    const [noWebcastsFound, setNoWebcastsFound] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false); // Prevent premature "no webcasts" message

    // URL search params for deep linking
    const [urlSku, setUrlSku] = useQueryState('sku');
    const [urlTeam, setUrlTeam] = useQueryState('team');
    const [urlMatch, setUrlMatch] = useQueryState('match'); // Selected match ID
    // Note: vid/live params will be dynamically managed based on stream count
    const [urlVid1, setUrlVid1] = useQueryState('vid1');
    const [urlVid2, setUrlVid2] = useQueryState('vid2');
    const [urlVid3, setUrlVid3] = useQueryState('vid3');
    const [urlLive1, setUrlLive1] = useQueryState('live1');
    const [urlLive2, setUrlLive2] = useQueryState('live2');
    const [urlLive3, setUrlLive3] = useQueryState('live3');
    const [urlVid, setUrlVid] = useQueryState('vid'); // Single day fallback
    const [urlLive, setUrlLive] = useQueryState('live'); // Single day fallback
    const [urlPreset, setUrlPreset] = useQueryState('preset'); // Short link support

    // Flag to prevent infinite loops during deep linking
    // Flag to prevent infinite loops during deep linking
    const [isDeepLinking, setIsDeepLinking] = useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return !!params.get('sku') || !!params.get('preset');
        }
        return false;
    });
    const hasDeepLinked = useRef(false);
    const isInternalLoading = useRef(false);

    // Form inputs
    const [eventUrl, setEventUrl] = useState('');
    const [teamNumber, setTeamNumber] = useState('');

    // UI State
    /** @type {'search' | 'list' | 'matches'} */
    const [activeTab, setActiveTab] = useState('list');
    const [matchesTabState, setMatchesTabState] = useState({ filter: 'all', search: '' });

    // Global Team Search State (No Event Mode)
    const [globalTeamEvents, setGlobalTeamEvents] = useState([]);
    const [isGlobalSearchLoading, setIsGlobalSearchLoading] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [expandedMatchId, setExpandedMatchId] = useState(null);
    const [isEventSearchCollapsed, setIsEventSearchCollapsed] = useState(false);
    const [includePastSeasons, setIncludePastSeasons] = useState(false);



    // Data
    const [event, setEvent] = useState(null);
    const [team, setTeam] = useState(null);
    const [matches, setMatches] = useState([]);
    const [teams, setTeams] = useState([]); // For TeamList
    const [rankings, setRankings] = useState([]); // For TeamList
    const [skills, setSkills] = useState([]); // For TeamList

    // Multi-stream support
    const [streams, setStreams] = useState([]);
    const [activeStreamId, setActiveStreamId] = useState(null);
    const [players, setPlayers] = useState({});

    // Loading states
    const [eventLoading, setEventLoading] = useState(false);
    const [teamLoading, setTeamLoading] = useState(false);
    const [rankingsLoading, setRankingsLoading] = useState(false); // For TeamList
    const [error, setError] = useState(null);

    // Sync state
    const [syncMode, setSyncMode] = useState(false);
    const [manualSyncConfirmed, setManualSyncConfirmed] = useState(false);
    const [selectedMatchId, setSelectedMatchId] = useState(null);

    // Matches Tab State
    const [allMatches, setAllMatches] = useState([]);
    const [allMatchesLoading, setAllMatchesLoading] = useState(false);

    // Event Presets (Admin-defined routes)
    const [presets, setPresets] = useState([]);
    const [presetsLoading, setPresetsLoading] = useState(true);
    const [selectedPresetSku, setSelectedPresetSku] = useState('');
    const urlPresetRef = useRef(null);

    // Multi-Division State
    const [multiDivisionMode, setMultiDivisionMode] = useState(false);
    const [activeDivisionId, setActiveDivisionId] = useState(null);
    const [divisionsFromPreset, setDivisionsFromPreset] = useState(false); // True if divisions came from preset, not API

    // Logic to prevent scrolling when event search is collapsed is handled by layout
    useEffect(() => {
        if (event && !eventLoading && hasDeepLinked.current) {
            setIsEventSearchCollapsed(true);
        }
    }, [event, eventLoading]);

    // Auto-save to history whenever event or streams change
    useEffect(() => {
        if (event && streams.length > 0) {
            // Only save if at least one stream has a URL
            const hasUrls = streams.some(s => s.url);
            if (hasUrls) {
                saveEventToHistory(event, streams);
            }
        }
    }, [event, streams]);

    // Fetch Event Presets on mount
    useEffect(() => {
        const fetchPresets = async () => {
            // Already initialized to true
            try {
                const res = await fetch('/api/jumper/get-all-routes');
                if (res.ok) {
                    const data = await res.json();
                    setPresets(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Failed to fetch presets', err);
            } finally {
                setPresetsLoading(false);
            }
        };
        fetchPresets();
    }, []);

    // Deep linking: Load from URL params on mount
    // Reactive URL parameter detection (Mount + Back/Forward)
    useEffect(() => {
        const loadFromUrl = async () => {
            // Wait for presets to load if we have a preset param
            // This assumes fetchPresets will eventually finish and set loading=false
            if (urlPreset && presetsLoading) {
                return;
            }

            // Check if we have URL params to load
            if (!urlSku && !urlPreset) {
                if (isDeepLinking) setIsDeepLinking(false);
                // If we are undergoing a manual load, ignore empty URL params briefly
                if (isInternalLoading.current) return;

                // If we had a preset/event but URL is now empty (e.g. user hit back to home), clear it
                // BUT: Ensure we don't clear if we are just switching betweeen sku/preset modes or initial load
                if ((event || urlPresetRef.current) && !isInternalLoading.current) {
                    handleClearAll();
                }
                urlPresetRef.current = null;
                return;
            }

            // Check if URL matches current state to avoid redundant loads
            const currentSku = event?.sku;
            // Normalize refs to string to ensure safe comparison
            const isPresetChange = String(urlPreset) !== String(urlPresetRef.current);
            const isSkuChange = urlSku && urlSku !== currentSku;

            if (!isPresetChange && !isSkuChange) return;

            hasDeepLinked.current = true;
            urlPresetRef.current = urlPreset;

            try {
                if (urlPreset) {
                    // Try to find the preset in current list
                    const targetPreset = presets.find(p => p.path === urlPreset);

                    if (targetPreset) {
                        // Capture team/match params BEFORE calling handleLoadPreset
                        // because handleLoadPreset will clear state
                        const capturedTeam = urlTeam;
                        const capturedMatch = urlMatch;

                        await handleLoadPreset(targetPreset, { preserveDeepLinkParams: true });

                        // Restore team/match params after preset loaded
                        if (capturedTeam) {
                            setTeamNumber(capturedTeam);
                            // Don't clear urlTeam - let it remain for the team search effect
                        }
                        if (capturedMatch) {
                            // urlMatch should remain set for the auto-jump effect
                            setUrlMatch(capturedMatch);
                        }
                        return;
                    }
                    // If not found after loading finished, it's invalid. Fall through or log?
                    // We'll let it fall through to manual SKU check just in case, but likely it does nothing.
                }

                // Standard SKU deep linking
                if (urlSku) {
                    const foundEvent = await getEventBySku(urlSku);
                    setEvent(foundEvent);
                    setEventUrl(`https://www.robotevents.com/${urlSku}.html`);

                    // Initialize streams for the event (triggers popup and basic setup)
                    let initializedStreams = await initializeStreamsForEvent(foundEvent);
                    let newStreams = [...initializedStreams]; // Clone to safely apply overrides
                    const days = calculateEventDays(foundEvent.start, foundEvent.end);

                    // Override with URL params if present
                    newStreams.forEach(stream => {
                        const i = stream.dayIndex;
                        let vidParam = null;
                        let liveParam = null;

                        if (days === 1) {
                            vidParam = urlVid;
                            liveParam = urlLive;
                        } else {
                            vidParam = [urlVid1, urlVid2, urlVid3][i];
                            liveParam = [urlLive1, urlLive2, urlLive3][i];
                        }

                        if (vidParam) {
                            stream.url = `https://www.youtube.com/watch?v=${vidParam}`;
                            stream.videoId = vidParam;
                            stream.source = 'url-override';
                        } else if (liveParam) {
                            stream.url = `https://www.youtube.com/live/${liveParam}`;
                            stream.videoId = liveParam;
                            stream.source = 'url-override';
                        }
                    });

                    setStreams(newStreams);
                    if (newStreams.length > 0) {
                        setActiveStreamId(newStreams[0].id);
                    }

                    // Set team number if specified (search will be triggered by separate effect)
                    if (urlTeam) {
                        setTeamNumber(urlTeam);
                    }
                }
            } catch (err) {
                console.error('Error loading from URL:', err);
                setError(`Failed to load from URL: ${err.message}`);
            } finally {
                // Delay resetting isDeepLinking to prevent URL sync effects from running too early
                // Give enough time for stream start times to be fetched
                setTimeout(() => {
                    setIsDeepLinking(false);
                }, 1000);
            }
        };

        loadFromUrl();
    }, [urlSku, urlPreset, presets.length, presetsLoading]);

    // Sync URL params when event changes
    useEffect(() => {
        if (isDeepLinking || hasDeepLinked.current && !event) {
            return;
        }

        if (event && event.sku) {
            // Only sync SKU if NOT in preset mode to keep URL clean
            if (!urlPreset) setUrlSku(event.sku);
        } else {
            setUrlSku(null);
        }
    }, [event, setUrlSku, isDeepLinking, urlPreset]);

    // Sync URL params when streams change
    useEffect(() => {
        if (isDeepLinking || urlPreset) {
            return;
        }

        if (!event || streams.length === 0) {
            // Clear all video params
            setUrlVid(null);
            setUrlLive(null);
            setUrlVid1(null);
            setUrlVid2(null);
            setUrlVid3(null);
            setUrlLive1(null);
            setUrlLive2(null);
            setUrlLive3(null);
            return;
        }

        const days = streams.length;

        if (days === 1) {
            // Single day event
            const stream = streams[0];
            if (stream && stream.url) {
                const videoId = extractVideoId(stream.url);
                if (videoId) {
                    // Determine if it's a live URL or regular video URL
                    if (stream.url.includes('/live/')) {
                        setUrlLive(videoId);
                        setUrlVid(null);
                    } else {
                        setUrlVid(videoId);
                        setUrlLive(null);
                    }
                } else {
                    setUrlVid(null);
                    setUrlLive(null);
                }
            } else {
                setUrlVid(null);
                setUrlLive(null);
            }
            // Clear indexed params for single day
            setUrlVid1(null);
            setUrlVid2(null);
            setUrlVid3(null);
            setUrlLive1(null);
            setUrlLive2(null);
            setUrlLive3(null);
        } else {
            // Multi-day event - use indexed params
            // Clear single-day params
            setUrlVid(null);
            setUrlLive(null);

            // Set indexed params
            const setters = [
                { vid: setUrlVid1, live: setUrlLive1 },
                { vid: setUrlVid2, live: setUrlLive2 },
                { vid: setUrlVid3, live: setUrlLive3 }
            ];

            streams.forEach((stream, i) => {
                if (i >= 3) return; // Support up to 3 days for now

                const videoId = stream.url ? extractVideoId(stream.url) : null;
                const setter = setters[i];

                if (videoId) {
                    if (stream.url.includes('/live/')) {
                        setter.live(videoId);
                        setter.vid(null);
                    } else {
                        setter.vid(videoId);
                        setter.live(null);
                    }
                } else {
                    setter.vid(null);
                    setter.live(null);
                }
            });

            // Clear unused params
            for (let i = streams.length; i < 3; i++) {
                const setter = setters[i];
                setter.vid(null);
                setter.live(null);
            }
        }
    }, [streams, event, setUrlVid, setUrlLive, setUrlVid1, setUrlVid2, setUrlVid3, setUrlLive1, setUrlLive2, setUrlLive3, isDeepLinking]);

    // Sync URL params when team changes
    useEffect(() => {
        if (isDeepLinking) return;

        if (team && team.number) {
            setUrlTeam(team.number);
        } else if (!teamNumber) {
            setUrlTeam(null);
        }
    }, [team, teamNumber, setUrlTeam, isDeepLinking]);

    // Trigger team search after event loads from deep linking
    useEffect(() => {
        // Guard: Don't trigger if teamNumber is empty (happens after reset)
        if (!isDeepLinking && hasDeepLinked.current && event && urlTeam && teamNumber && teamNumber.trim() !== '' && !team) {
            // Event has loaded from URL and we have a team to search for
            handleTeamSearch(urlTeam);
        }
    }, [event, urlTeam, teamNumber, team, isDeepLinking]);

    const hasJumpedToMatch = useRef(false);

    // Sync URL params when selected match changes
    useEffect(() => {
        if (isDeepLinking) return;

        // Prevent clearing the URL match param during initial load race conditions
        // If we have a URL param, no selected match yet, and haven't performed the initial jump,
        // we should leave the URL param alone so the auto-jump effect can use it.
        if (urlMatch && !selectedMatchId && !hasJumpedToMatch.current) {
            return;
        }

        if (selectedMatchId) {
            setUrlMatch(selectedMatchId.toString());
        } else {
            setUrlMatch(null);
        }
    }, [selectedMatchId, setUrlMatch, isDeepLinking, urlMatch]);

    // Webcast Detection Effect
    useEffect(() => {
        const detect = async () => {
            if (!event || streams.some(s => s.videoId) || noWebcastsFound || showStreamSuccess) return;

            // Prevent running if we just ran it (rudimentary check, or rely on state)
            // Actually, just check if we have candidates or if we've already marked as not found
            if (webcastCandidates.length > 0) return;

            try {
                const candidates = await findWebcastCandidates(event);
                if (candidates.length > 0) {
                    setWebcastCandidates(candidates);
                    const directVideos = candidates.filter(c => c.type === 'direct-video');
                    if (directVideos.length === 1) {
                        handleWebcastSelect(directVideos[0].videoId, directVideos[0].url, 'auto');
                    }
                } else {
                    setNoWebcastsFound(true);
                    // Check cache
                    const cached = getCachedWebcast(event.id);
                    if (cached) {
                        setStreams(prev => prev.map((s, idx) =>
                            idx === 0 ? { ...s, url: cached.url, videoId: cached.videoId } : s
                        ));
                    }
                }
            } catch (err) {
                console.error("Auto-webcast detection failed:", err);
            }
        };

        detect();
    }, [event]); // Run when event object changes

    // Deep linking: Auto-jump to match
    useEffect(() => {
        if (isDeepLinking || !urlMatch || matches.length === 0 || hasJumpedToMatch.current) return;

        const matchToJump = matches.find(m => m.id.toString() === urlMatch);
        if (matchToJump) {
            // Find the appropriate stream for this match
            // We need to pass event start for findStreamForMatch, make sure it's available
            if (!event) return;

            const matchStream = findStreamForMatch(matchToJump, streams, event.start);

            // Check if stream is ready (has start time and player)
            if (matchStream && matchStream.streamStartTime && players[matchStream.id]) {
                jumpToMatch(matchToJump);
                hasJumpedToMatch.current = true;
            }
        }
    }, [isDeepLinking, urlMatch, matches, streams, players, event]);

    // Fallback: Ensure streams are initialized if event exists but streams are empty
    // This catches race conditions where event loads via deep-link/nuqs but streams fail to init
    useEffect(() => {
        if (event && streams.length === 0) {
            console.log("Fallback: Initializing streams for event", event.sku);
            initializeStreamsForEvent(event);
        }
    }, [event, streams]);

    // Helper: Get active stream object
    const getActiveStream = () => {
        return streams.find(s => s.id === activeStreamId) || streams[0] || null;
    };

    // Helper: Calculate event duration and initialize streams
    const initializeStreamsForEvent = async (eventData) => {
        setNoWebcastsFound(false);
        setWebcastCandidates([]);
        setIsDetecting(true); // Mark detection as in progress

        const divisions = eventData.divisions && eventData.divisions.length > 0
            ? eventData.divisions
            : [{ id: 1, name: 'Default Division' }];

        const newStreams = await detectOrFallbackStreams(eventData, divisions);

        setStreams(newStreams);

        // Check if we found any detected streams
        const hasDetectedStreams = newStreams.some(s => s.videoId);
        if (hasDetectedStreams) {
            setShowStreamSuccess(true);
            setTimeout(() => setShowStreamSuccess(false), 3000); // Hide after 3s
        }

        setIsDetecting(false); // Detection complete

        // Auto-enable multi-division mode if more than 1 division exists
        const isMultiDiv = divisions.length > 1;
        setMultiDivisionMode(isMultiDiv);
        setActiveDivisionId(divisions[0].id);

        if (newStreams.length > 0) {
            setActiveStreamId(newStreams[0].id);
        }

        return newStreams; // Return for caller
    };

    // Auto-switch active stream if current is empty and others have content
    useEffect(() => {
        const activeStream = getActiveStream();
        const hasVideo = activeStream?.videoId;

        if (!hasVideo) {
            // Find first stream with a video
            const firstWithVideo = streams.find(s => s.videoId);
            if (firstWithVideo) {
                setActiveStreamId(firstWithVideo.id);
            }
        }
    }, [streams, activeStreamId]);

    const handleEventSearch = async () => {
        if (!eventUrl.trim()) {
            setError('Please enter an event URL');
            return;
        }

        isInternalLoading.current = true;
        setEventLoading(true);
        setError('');
        setNoWebcastsFound(false);
        setUrlPreset(null); // Clear preset on manual search
        urlPresetRef.current = null; // Sync ref immediately

        try {
            const skuMatch = eventUrl.match(/(RE-[A-Z0-9]+-\d{2}-\d{4})/);
            if (!skuMatch) {
                throw new Error('Invalid RobotEvents URL. Could not find SKU.');
            }
            const sku = skuMatch[1];
            setUrlSku(sku); // Set SKU immediately
            const foundEvent = await getEventBySku(sku);

            // Only reinitialize streams if it's a different event or no streams exist
            const isDifferentEvent = !event || event.id !== foundEvent.id;
            const hasExistingStreams = streams.length > 0 && streams.some(s => s.url);

            if (isDifferentEvent || !hasExistingStreams) {
                setEvent(foundEvent);
                // Initialize streams based on event duration
                const initializedStreams = await initializeStreamsForEvent(foundEvent);

                // Webcast detection (Official/Legacy)
                const candidates = await findWebcastCandidates(foundEvent);

                // Check if we successfully loaded streams via NEW method
                const hasDetectedStreams = initializedStreams && initializedStreams.some(s => s.videoId);

                if (candidates.length > 0) {
                    setWebcastCandidates(candidates);
                    // Auto-select first if only one direct video AND no detected streams
                    const directVideos = candidates.filter(c => c.type === 'direct-video');
                    if (directVideos.length === 1 && !hasDetectedStreams) {
                        handleWebcastSelect(directVideos[0].videoId, directVideos[0].url, 'auto');
                    }
                } else {
                    // Only show "No Webcasts" if BOTH official and new detection failed
                    if (!hasDetectedStreams) {
                        setNoWebcastsFound(true);
                    }
                    // Check cache (Legacy logic from lines 640+ would be here, but effectively redundant if detect-streams works)
                }
            } else {
                // Same event, just update event data without touching streams
                setEvent(foundEvent);
            }
            // Check cache
            const cached = getCachedWebcast(foundEvent.id);
            if (cached) {
                // Populate first stream with cached URL
                setStreams(prev => prev.map((s, idx) =>
                    idx === 0 ? { ...s, url: cached.url, videoId: cached.videoId } : s
                ));
            }


        } catch (err) {
            setError(err.message);
        } finally {
            setEventLoading(false);
            if (!error) setIsEventSearchCollapsed(true);
            setTimeout(() => { isInternalLoading.current = false; }, 1000);
        }
    };

    const handleWebcastSelect = (selectedVideoId, selectedUrl, method) => {
        // Populate first stream with selected webcast
        setStreams(prev => prev.map((s, idx) =>
            idx === 0 ? { ...s, url: selectedUrl, videoId: selectedVideoId } : s
        ));
        if (event) {
            setCachedWebcast(event.id, selectedVideoId, selectedUrl, method);
        }
        setNoWebcastsFound(false);
        setWebcastCandidates([]);
    };

    const handleSeek = (seconds) => {
        const player = players[activeStreamId];
        if (player && typeof player.getCurrentTime === 'function') {
            const currentTime = player.getCurrentTime();
            player.seekTo(currentTime + seconds, true);
        }
    };

    // Reset manual sync confirmation when switching streams
    useEffect(() => {
        if (syncMode && activeStreamId) {
            setManualSyncConfirmed(false);
        }
    }, [activeStreamId, syncMode]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in an input or textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            switch (e.key) {
                case 'j':
                case 'J':
                    handleSeek(-60);
                    break;
                case 'k':
                case 'K':
                    handleSeek(60);
                    break;
                case 'ArrowLeft':
                    handleSeek(-10);
                    break;
                case 'ArrowRight':
                    handleSeek(10);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeStreamId, players]);

    // Effect to fetch all matches when tab is 'matches'
    useEffect(() => {
        if (activeTab === 'matches' && event && allMatches.length === 0 && !allMatchesLoading) {
            const fetchAllMatches = async () => {
                setAllMatchesLoading(true);
                try {
                    const matches = await getMatchesForEvent(event);
                    setAllMatches(matches);
                } catch (err) {
                    console.error('Failed to fetch all matches:', err);
                    setError('Failed to load matches list: ' + err.message);
                } finally {
                    setAllMatchesLoading(false);
                }
            };
            fetchAllMatches();
        }
    }, [activeTab, event, allMatches.length, allMatchesLoading]);

    // Effect to fetch teams, rankings, and skills when event changes and tab is 'list'
    useEffect(() => {
        if (activeTab === 'list' && event && !rankingsLoading) {
            const fetchData = async () => {
                setRankingsLoading(true);
                try {
                    const [eventTeams, eventRankings, eventSkills] = await Promise.all([
                        getTeamsForEvent(event.id),
                        getRankingsForEvent(event.id, event.divisions),
                        getSkillsForEvent(event.id)
                    ]);
                    setTeams(eventTeams);
                    setRankings(eventRankings);
                    setSkills(eventSkills);
                } catch (err) {
                    console.error('Failed to fetch team list data:', err);
                    setError('Failed to load team list data: ' + err.message);
                } finally {
                    setRankingsLoading(false);
                }
            };
            fetchData();
        }
    }, [activeTab, event]);


    const handleLoadFromHistory = async (historyEntry) => {
        isInternalLoading.current = true;
        // Reconstruct event object
        let reconstructedEvent = {
            id: historyEntry.eventId,
            name: historyEntry.eventName,
            start: historyEntry.eventStart,
            end: historyEntry.eventEnd,
            sku: historyEntry.eventSku,
            program: historyEntry.eventProgram,
            season: historyEntry.eventSeason,
            divisions: historyEntry.eventDivisions
        };

        setUrlPreset(null);
        urlPresetRef.current = null; // Sync ref immediately
        setUrlSku(historyEntry.eventSku); // Set SKU immediately
        setSelectedPresetSku('');

        // If program, season, or divisions is missing (legacy history), fetch full event details
        if ((!reconstructedEvent.program || !reconstructedEvent.season || !reconstructedEvent.divisions) && reconstructedEvent.sku) {
            try {
                const fullEvent = await getEventBySku(reconstructedEvent.sku);
                reconstructedEvent = fullEvent;
                // Update history with full details
                saveEventToHistory(fullEvent, historyEntry.streams.map(s => ({
                    label: s.label,
                    url: s.url,
                    videoId: s.videoId,
                    dayIndex: s.dayIndex,
                    streamStartTime: s.streamStartTime
                })));
            } catch (err) {
                console.error('Failed to fetch full event details:', err);
            }
        }

        setEvent(reconstructedEvent);
        setEventUrl(`https://www.robotevents.com/${historyEntry.eventSku}.html`);

        // If history has streams, restore them. Otherwise, initialize fresh ones.
        if (historyEntry.streams && historyEntry.streams.length > 0) {
            const restoredStreams = historyEntry.streams.map((s, idx) => ({
                id: s.id || `stream-day-${idx}`,
                url: s.url || '',
                videoId: s.videoId || null,
                streamStartTime: s.streamStartTime || null,
                divisionId: s.divisionId || 1, // Fallback for legacy
                dayIndex: s.dayIndex,
                label: s.label,
                date: s.date
            }));

            setStreams(restoredStreams);
            if (restoredStreams.length > 0) {
                setActiveStreamId(restoredStreams[0].id);
            }

            // Sync multi-division state
            const divisions = reconstructedEvent.divisions && reconstructedEvent.divisions.length > 0
                ? reconstructedEvent.divisions
                : [{ id: 1, name: 'Default Division' }];
            const isMultiDiv = divisions.length > 1;
            setMultiDivisionMode(isMultiDiv);
            setActiveDivisionId(divisions[0].id);
        } else {
            // No streams in history? Initialize them fresh for the event
            initializeStreamsForEvent(reconstructedEvent);
        }

        // Reset internal loading flag after a brief delay
        setTimeout(() => { isInternalLoading.current = false; }, 1000);
    };

    const handleLoadPreset = async (preset, options = {}) => {
        const { preserveDeepLinkParams = false } = options;

        isInternalLoading.current = true;
        setEventLoading(true);
        setError('');
        setNoWebcastsFound(false);
        setWebcastCandidates([]);

        // Clear previous team/match data when switching events via preset
        // But preserve URL params if coming from a deep link
        setTeam(null);
        setTeamNumber('');
        setMatches([]);
        if (!preserveDeepLinkParams) {
            setUrlTeam(null);
            setUrlMatch(null);
        }

        setSelectedPresetSku(preset.sku);
        setUrlPreset(preset.path); // Set preset mode in URL
        urlPresetRef.current = preset.path; // Prevent reactive effect from re-loading
        setUrlSku(null); // Clear SKU as it's redundant with preset

        // Clear all stream-related params to keep URL clean for sharing
        setUrlVid(null);
        setUrlLive(null);
        setUrlVid1(null);
        setUrlVid2(null);
        setUrlVid3(null);
        setUrlLive1(null);
        setUrlLive2(null);
        setUrlLive3(null);
        try {
            let foundEvent = await getEventBySku(preset.sku);
            setEvent(foundEvent);
            // Correct the robotevents URL format
            setEventUrl(`https://www.robotevents.com/robot-competitions/vex-robotics-competition/${preset.sku}.html`);

            const days = calculateEventDays(foundEvent.start, foundEvent.end);

            // Check if preset has manually defined divisions
            const presetDivisionNames = preset.divisionNames || null;
            const presetDivCount = presetDivisionNames ? Object.keys(presetDivisionNames).length : 0;
            const apiDivCount = foundEvent.divisions?.length || 0;

            let divisions;
            let usingPresetDivisions = false;

            // Only use preset divisions when preset has MORE divisions than the API
            // This handles the case where divisions aren't published on RobotEvents yet
            // but we've manually configured them in the admin panel
            if (presetDivCount > apiDivCount) {
                // Preset has more divisions than API - use preset divisions
                divisions = Object.keys(presetDivisionNames).map(id => ({
                    id: parseInt(id) || id,
                    name: presetDivisionNames[id]
                }));
                usingPresetDivisions = true;
                console.log('[PRESET LOAD] Using preset-defined divisions (preset has more):', divisions);
            } else if (apiDivCount > 0) {
                // API has divisions - always prefer them
                divisions = foundEvent.divisions;
                usingPresetDivisions = false;
            } else {
                // Fallback to default single division
                divisions = [{ id: 1, name: 'Default Division' }];
                usingPresetDivisions = false;
            }

            setDivisionsFromPreset(usingPresetDivisions);

            // If using preset divisions, update the event object so division tabs work
            if (usingPresetDivisions) {
                foundEvent = { ...foundEvent, divisions };
                setEvent(foundEvent);
            }

            let newStreams = [];

            // Auto-detect streams or auto-generate defaults if no preset streams
            if (!preset.streams || Object.keys(preset.streams).length === 0) {
                newStreams = await detectOrFallbackStreams(foundEvent, divisions);
            }

            // Only proceed with manual generation if auto-detect didn't find anything
            if (newStreams.length === 0) {
                // Check if we need to remap divisions (preset has divisionNames that don't match API)
                let divisionMapping = null; // Map from API divisionId to preset divisionId

                if (presetDivisionNames && preset.streams && typeof preset.streams === 'object' && !Array.isArray(preset.streams)) {
                    const presetDivIds = Object.keys(presetDivisionNames);
                    const apiDivNames = divisions.map(d => (d.name || '').toLowerCase().trim());

                    // Check if we need remapping (IDs don't directly match)
                    const needsRemapping = divisions.some(apiDiv => !preset.streams[apiDiv.id]);

                    if (needsRemapping && presetDivIds.length > 0) {
                        console.log('[PRESET LOAD] Division remapping needed', { presetDivisionNames, apiDivisions: divisions.map(d => ({ id: d.id, name: d.name })) });

                        divisionMapping = {};

                        divisions.forEach((apiDiv, apiIdx) => {
                            // Try to find matching preset division by name similarity
                            let matchingPresetId = null;

                            for (const presetDivId of presetDivIds) {
                                const presetName = (presetDivisionNames[presetDivId] || '').toLowerCase().trim();
                                const apiName = (apiDiv.name || '').toLowerCase().trim();

                                // Check for exact match, contains, or is contained by
                                if (presetName === apiName ||
                                    presetName.includes(apiName) ||
                                    apiName.includes(presetName) ||
                                    // Also check without "Division" prefix
                                    presetName.replace('division', '').trim() === apiName.replace('division', '').trim()) {
                                    matchingPresetId = presetDivId;
                                    break;
                                }
                            }

                            // Fallback to position-based matching
                            if (!matchingPresetId && presetDivIds[apiIdx]) {
                                matchingPresetId = presetDivIds[apiIdx];
                                console.log(`[PRESET LOAD] Using position-based match for ${apiDiv.name}: presetId=${matchingPresetId}`);
                            }

                            if (matchingPresetId) {
                                divisionMapping[apiDiv.id] = matchingPresetId;
                            }
                        });

                        console.log('[PRESET LOAD] Division mapping result:', divisionMapping);
                    }
                }

                divisions.forEach(division => {
                    for (let i = 0; i < days; i++) {
                        const eventStartDate = parseCalendarDate(foundEvent.start);
                        const dayDate = new Date(eventStartDate);
                        dayDate.setDate(eventStartDate.getDate() + i);
                        const dateLabel = format(dayDate, 'MMM d');

                        // Support both legacy (array) and multi-division (object) stream formats
                        let presetVideoId = null;
                        if (Array.isArray(preset.streams)) {
                            const isFirstDivision = division.id === (foundEvent.divisions?.[0]?.id || 1);
                            presetVideoId = (isFirstDivision) ? (preset.streams[i] || null) : null;
                        } else if (preset.streams && typeof preset.streams === 'object') {
                            // Try direct ID match first
                            let divStreams = preset.streams[division.id];

                            // If no direct match and we have a mapping, use it
                            if (!divStreams && divisionMapping && divisionMapping[division.id]) {
                                divStreams = preset.streams[divisionMapping[division.id]];
                            }

                            // Fallback for single-division events: if preset has only 1 division
                            // and API has only 1 division, use the first available streams
                            // regardless of ID mismatch
                            if (!divStreams) {
                                const presetDivIds = Object.keys(preset.streams);
                                if (presetDivIds.length === 1 && divisions.length === 1) {
                                    divStreams = preset.streams[presetDivIds[0]];
                                    console.log(`[PRESET LOAD] Single-division fallback: using preset div ${presetDivIds[0]} for API div ${division.id}`);
                                }
                            }

                            presetVideoId = divStreams ? (divStreams[i] || null) : null;
                        }

                        const streamUrl = presetVideoId ? `https://www.youtube.com/watch?v=${presetVideoId}` : '';

                        newStreams.push({
                            id: `stream-div-${division.id}-day-${i}`,
                            url: streamUrl,
                            videoId: presetVideoId,
                            streamStartTime: null,
                            divisionId: division.id,
                            dayIndex: i,
                            label: days > 1 ? `Day ${i + 1} - ${dateLabel}` : 'Livestream',
                            date: dayDate.toISOString()
                        });
                    }
                });
            }

            setStreams(newStreams);

            const isMultiDiv = divisions.length > 1;
            setMultiDivisionMode(isMultiDiv);
            setActiveDivisionId(divisions[0].id);

            if (newStreams.length > 0) {
                // If we have preset streams, find the first one that has a videoId
                const firstWithVideo = newStreams.find(s => s.videoId);
                setActiveStreamId(firstWithVideo ? firstWithVideo.id : newStreams[0].id);
            }

            setIsEventSearchCollapsed(true);
        } catch (err) {
            console.error('Failed to load preset:', err);
            setError('Failed to load preset: ' + err.message);
        } finally {
            setEventLoading(false);
            setTimeout(() => { isInternalLoading.current = false; }, 1000);
        }
    };

    // Searching Team Logic
    const handleTeamSearch = async (overrideTeamNum) => {
        const teamNumToSearch = overrideTeamNum || teamNumber;
        if (!teamNumToSearch.trim()) return;

        // Mode A: Global Search (No Event Loaded)
        if (!event) {
            setIsGlobalSearchLoading(true);
            setGlobalTeamEvents([]);
            setError('');

            try {
                // 1. Get Team ID first
                const teamData = await getTeamByNumber(teamNumToSearch);
                if (teamData) {
                    let events = [];

                    if (includePastSeasons) {
                        // User requested ALL history -> fetch without season filter
                        events = await getEventsForTeam(teamData.id);
                        // Reset the toggle after search so next search defaults to active only (per user request)
                        setIncludePastSeasons(false);
                    } else {
                        // Default: Filter by ACTIVE seasons only
                        const activeSeasons = await getActiveSeasons();
                        // Extract IDs (e.g. [181, 182, 190])
                        const activeSeasonIds = activeSeasons.map(s => s.id);

                        if (activeSeasonIds.length > 0) {
                            events = await getEventsForTeam(teamData.id, activeSeasonIds);
                        } else {
                            // Fallback if no active seasons found (shouldn't happen, but safe default)
                            console.warn("No active seasons found, falling back to recent date filter.");
                            const allEvents = await getEventsForTeam(teamData.id);
                            events = allEvents.filter(e => new Date(e.start) > new Date('2024-05-01'));
                        }
                    }

                    setGlobalTeamEvents(events);
                } else {
                    setError(`Team ${teamNumToSearch} not found.`);
                }
            } catch (err) {
                console.error("Global search failed:", err);
                setError(`Could not find team or events for ${teamNumToSearch}`);
            } finally {
                setIsGlobalSearchLoading(false);
            }
            return;
        }

        // Mode B: Event-Specific Search (Existing Logic)
        setActiveTab('search'); // Switch to search tab when searching
        setTeamLoading(true);
        setError('');
        setTeam(null);
        setMatches([]);

        setUrlTeam(teamNumToSearch); // Update URL params

        if (!event) {
            // Only show error if not during deep linking
            if (!isDeepLinking) {
                setError('Please find an event first');
            }
            return;
        }

        if (!teamNumToSearch.trim()) {
            setError('Please enter a team number');
            return;
        }

        setTeamLoading(true);
        setError('');
        // Update the input field if searching via click
        if (overrideTeamNum) {
            setTeamNumber(overrideTeamNum);
        }

        try {
            setTeamLoading(true);
            setError('');

            // Use the searchNumber determined above (supports both specificTeamNumber and state)
            const term = teamNumToSearch.trim();

            // First, get all teams for this event
            const eventTeams = await getTeamsForEvent(event.id);

            // Find the team in the event (case-insensitive)
            const foundTeam = eventTeams.find(t => t.number.toUpperCase() === term.toUpperCase());

            if (!foundTeam) {
                throw new Error(`Team ${term} is not registered for this event.`);
            }

            setTeam(foundTeam);

            let foundMatches = await getMatchesForEventAndTeam(event.id, foundTeam.id);
            if (foundMatches.length === 0) {
                throw new Error('No matches found for this team at this event.');
            }

            // Sort: played matches first (oldest to newest), then unplayed matches
            foundMatches = foundMatches.sort((a, b) => {
                const aStarted = a.started ? new Date(a.started).getTime() : null;
                const bStarted = b.started ? new Date(b.started).getTime() : null;

                if (aStarted && bStarted) return aStarted - bStarted;
                if (aStarted && !bStarted) return -1;
                if (!aStarted && bStarted) return 1;
                return 0;
            });

            console.warn('DEBUG: Match Data Loaded', {
                firstMatch: foundMatches[0],
                teamSearchingFor: foundTeam,
                alliancesOfFirstMatch: foundMatches[0]?.alliances
            });

            setMatches(foundMatches);
            // Reset expanded match when searching new team
            setExpandedMatchId(null);
        } catch (err) {
            console.error('DEBUG: Error in handleTeamSearch', err);
            setError(err.message);
        } finally {
            setTeamLoading(false);
        }
    };

    const handleManualSync = (match) => {
        // Find the appropriate stream for this match
        const matchStream = findStreamForMatch(match, streams, event?.start);

        if (!matchStream) {
            alert('No stream available for this match.');
            return;
        }

        const player = players[matchStream.id];
        if (!player) {
            alert('No player found. Load the stream first.');
            return;
        }

        const currentVideoTimeSec = player.getCurrentTime();
        const matchStartTimeMs = new Date(match.started).getTime();
        const calculatedStreamStart = matchStartTimeMs - (currentVideoTimeSec * 1000);

        // Update the stream's start time
        setStreams(prev => prev.map(s =>
            s.id === matchStream.id ? { ...s, streamStartTime: calculatedStreamStart } : s
        ));
        setSyncMode(false);
    };

    const jumpToMatch = async (match) => {
        // Find the appropriate stream for this match
        const matchStream = findStreamForMatch(match, streams, event?.start);

        if (!matchStream) {
            alert('No stream available for this match.');
            return;
        }

        // Always update UI (division tabs) even if we block the actual jump
        // This keeps the UI in sync with what the user is trying to view
        if (matchStream.id !== activeStreamId) {
            // Pause the currently active player if switching streams
            if (activeStreamId) {
                const currentPlayer = players[activeStreamId];
                if (currentPlayer && typeof currentPlayer.pauseVideo === 'function') {
                    currentPlayer.pauseVideo();
                }
            }

            setActiveStreamId(matchStream.id);
            // Also switch division view if applicable to keep UI in sync
            if (matchStream.divisionId) {
                setActiveDivisionId(matchStream.divisionId);
            }
        }

        const player = players[matchStream.id];
        if (!player) {
            alert('No player found for this stream. Please wait for it to load.');
            return;
        }

        if (!matchStream.streamStartTime) {
            alert('Please sync this stream first!');
            return;
        }

        const matchStartMs = new Date(match.started).getTime();
        const seekTimeSec = (matchStartMs - matchStream.streamStartTime) / 1000;

        if (seekTimeSec < 0) {
            alert("This match happened before the stream started!");
            return;
        }

        try {
            if (typeof player.seekTo === 'function') {
                player.seekTo(seekTimeSec, true);
                player.playVideo();
            } else {
                console.warn("Player seekTo is not a function", player);
            }
        } catch (err) {
            console.error("Error seeking video:", err);
            // It's likely the player isn't fully ready or the iframe is gone.
            // We can treat this as a non-fatal error for now.
        }
        setSelectedMatchId(match.id);
    };

    const handleClearAll = () => {
        // Reset Internal Refs/Flags FIRST (before state updates trigger re-renders)
        hasJumpedToMatch.current = false;
        hasDeepLinked.current = false;
        urlPresetRef.current = null;

        // Reset Data
        setEvent(null);
        setTeam(null);
        setMatches([]);
        setTeams([]);
        setRankings([]);
        setSkills([]);
        setStreams([]);
        setAllMatches([]);
        setActiveStreamId(null);
        setPlayers({});

        // Reset Form/UI Inputs
        setEventUrl('');
        setTeamNumber('');
        setSelectedMatchId(null);
        setExpandedMatchId(null);
        setError(null);
        setIsEventSearchCollapsed(false);
        setNoWebcastsFound(false);
        setWebcastCandidates([]);
        setSelectedPresetSku('');
        setMultiDivisionMode(false);
        setActiveDivisionId(null);
        setGlobalTeamEvents([]); // Clear global search results
        setIsGlobalSearchLoading(false);
        setGlobalSearchQuery('');
        setShowStreamSuccess(false);
        setIsDetecting(false);

        // Reset URL Parameters
        setUrlPreset(null);
        setUrlSku(null);
        setUrlTeam(null);
        setUrlMatch(null);
        setUrlVid(null);
        setUrlLive(null);
        setUrlVid1(null);
        setUrlVid2(null);
        setUrlVid3(null);
        setUrlLive1(null);
        setUrlLive2(null);
        setUrlLive3(null);
    };





    // Helper to render score
    const renderScore = (match, userAlliance, opponentAlliance) => {
        if (!match.started) return null;

        const isVIQC = event?.program?.code === 'VIQC' || event?.program?.code === 'VIQRC';

        if (isVIQC) {
            return <span className="font-semibold text-[var(--accent)]">{userAlliance.score}</span>;
        }

        // V5RC / VRC
        const userScore = userAlliance.score;
        const opponentScore = opponentAlliance.score;
        const userWon = userScore > opponentScore;
        const tie = userScore === opponentScore;

        return (
            <div className="flex gap-2 text-sm font-mono">
                <span className={`font-semibold ${userAlliance.color === 'red' ? 'text-red-400' : 'text-blue-400'} ${userWon ? 'underline decoration-2' : ''}`}>
                    {userScore}
                </span>
                <span className="text-[var(--text-faint)]">-</span>
                <span className={`font-semibold ${opponentAlliance.color === 'red' ? 'text-red-400' : 'text-blue-400'} ${!userWon && !tie ? 'underline decoration-2' : ''}`}>
                    {opponentScore}
                </span>
            </div>
        );
    };

    return (
        <div className="jumper-viewer font-sans flex flex-col text-[var(--text)]">
            {/* Floating Controls (Bottom Left) — hidden per redesign; kept for easy restore */}
            {false && (
                <div className="fixed bottom-4 left-4 z-40 flex gap-2">
                    <button
                        onClick={() => setShowEventHistory(true)}
                        className="p-3 bg-[var(--surface)]/90 hover:bg-[var(--surface-2)] border border-[var(--border)] rounded-full transition-all   backdrop-blur-sm"
                        title="Event History"
                    >
                        <History className="w-5 h-5 text-[var(--text-2)] hover:text-[var(--text)]" />
                    </button>
                    <div className="w-px h-8 bg-[var(--surface-2)] self-center mx-1"></div>
                    <button
                        onClick={handleClearAll}
                        className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition-all   backdrop-blur-sm group"
                        title="Clear All"
                    >
                        <RotateCcw className="w-5 h-5 text-red-400 group-hover:text-red-300" />
                    </button>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-[var(--text)] px-6 py-3 rounded-lg z-50  backdrop-blur-md">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 font-semibold hover:text-[var(--accent-ink)]">✕</button>
                </div>
            )}


            <main className="w-full">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full">
                    {/* Left Column: Stream & Stream Manager */}
                    <div className="xl:col-span-8 flex flex-col gap-6">
                        {/* Stream Player */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-1 rounded-lg overflow-hidden flex-shrink-0">
                            <div className="bg-black rounded-lg overflow-hidden aspect-video relative group">
                                {event && streams.length > 0 ? (
                                    streams.map((stream) => (
                                        <div
                                            key={stream.id}
                                            style={{ display: stream.id === activeStreamId ? 'block' : 'none' }}
                                            className="w-full h-full"
                                        >
                                            {stream.videoId ? (
                                                <YouTube
                                                    videoId={stream.videoId}
                                                    opts={{
                                                        height: '100%',
                                                        width: '100%',
                                                        playerVars: {
                                                            autoplay: 0,
                                                            modestbranding: 1,
                                                        },
                                                    }}
                                                    onReady={(event) => {
                                                        setPlayers(prev => ({ ...prev, [stream.id]: event.target }));
                                                    }}
                                                    className="w-full h-full"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[var(--text-faint)]">
                                                    <div className="text-center">
                                                        <Tv className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                                        <p>Enter a stream URL for {stream.label} below</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-faint)]">
                                        <div className="text-center">
                                            <Tv className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            {event ? (
                                                <p>No stream loaded. Use the controls below.</p>
                                            ) : (
                                                <p>Load an event first to watch streams</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Stream Switcher Overlay */}
                                {streams.length > 1 && (
                                    <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${getActiveStream()?.videoId ? 'opacity-0 group-hover:opacity-100' : ''}`}>

                                        {/* Division Switcher (Top Left) */}
                                        {multiDivisionMode && event?.divisions?.length > 1 && (
                                            <div className="absolute top-4 left-4 flex gap-1.5 pointer-events-auto">
                                                {event.divisions.map((div) => {
                                                    const hasAnyVideo = streams.some(s => s.divisionId === div.id && s.videoId);
                                                    return (
                                                        <button
                                                            key={div.id}
                                                            onClick={() => {
                                                                const currentStream = getActiveStream();
                                                                const targetDayIndex = currentStream?.dayIndex || 0;
                                                                const targetStream = streams.find(s => s.divisionId === div.id && s.dayIndex === targetDayIndex) || streams.find(s => s.divisionId === div.id);
                                                                if (targetStream) {
                                                                    setActiveDivisionId(div.id);
                                                                    setActiveStreamId(targetStream.id);
                                                                }
                                                            }}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all backdrop-blur-md border ${activeDivisionId === div.id
                                                                ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]  shadow-[var(--accent)]/20'
                                                                : 'bg-[var(--surface-2)]/60 text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]/80'
                                                                } ${!hasAnyVideo ? 'opacity-50' : ''}`}
                                                        >
                                                            {div.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Day Switcher (Top Right) */}
                                        <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto">
                                            {(multiDivisionMode
                                                ? streams.filter(s => s.divisionId === activeDivisionId && s.videoId)
                                                : streams.filter(s => s.divisionId === (event?.divisions?.[0]?.id || 1) && s.videoId)
                                            ).map((stream) => (
                                                <button
                                                    key={stream.id}
                                                    onClick={() => setActiveStreamId(stream.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-md ${activeStreamId === stream.id
                                                        ? 'bg-[var(--accent)]/90 text-[var(--accent-ink)]'
                                                        : 'bg-[var(--surface-2)]/60 text-[var(--text)] hover:bg-[var(--surface-2)]/80'
                                                        }`}
                                                >
                                                    {stream.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Find Event + Livestream — two cards that resize as an event loads.
                            Before an event: only Find Event. After: Find Event shrinks and
                            the Livestream card expands beside it. Widths animate in px so the
                            transition is actually interpolable (fr/minmax mixes don't animate). */}
                        <div
                            className="grid w-full items-stretch"
                            style={{
                                gridTemplateColumns: event ? '2fr 5fr' : '1fr 0fr',
                                columnGap: event ? '1rem' : 0,
                                transition: 'grid-template-columns 450ms cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                        >
                            {/* Card A: Find Event */}
                            <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden min-w-0">
                                {event && isEventSearchCollapsed ? (
                                    <button
                                        onClick={() => setIsEventSearchCollapsed(false)}
                                        className="w-full h-full text-left p-3 hover:bg-[var(--surface-2)]/50 transition-colors"
                                    >
                                        <p className="text-[var(--text)] font-semibold text-sm line-clamp-2" title={event.name}>{event.name}</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">
                                            {event.location?.venue}{event.location?.city ? `, ${event.location.city}` : ''}
                                        </p>
                                        <span className="inline-block mt-2 text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">Change event</span>
                                    </button>
                                ) : (
                                    <div className="p-3 space-y-3">
                                        {event && (
                                            <button
                                                onClick={() => setIsEventSearchCollapsed(true)}
                                                className="absolute top-2.5 right-2.5 z-10 text-[var(--text-faint)] hover:text-[var(--text)] p-0.5"
                                                title="Collapse"
                                            >
                                                <ChevronUp className="w-4 h-4" />
                                            </button>
                                        )}

                                        {/* Presets Dropdown */}
                                        {presets.length > 0 && (
                                            <div className="space-y-1.5">
                                                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest ml-1">
                                                    <Star className="w-3 h-3 text-yellow-500" />
                                                    Featured Events
                                                </label>
                                                <div className="relative group">
                                                    <select
                                                        onChange={(e) => {
                                                            const preset = presets.find(p => p.sku === e.target.value);
                                                            if (preset) handleLoadPreset(preset);
                                                        }}
                                                        value={selectedPresetSku}
                                                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all appearance-none cursor-pointer hover:border-[var(--border-strong)] shadow-inner"
                                                    >
                                                        <option value="">Select an event...</option>
                                                        {presets.map((p, idx) => (
                                                            <option key={idx} value={p.sku}>{p.label}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-faint)] group-hover:text-[var(--accent)] transition-colors">
                                                        <ChevronDown className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest ml-1">
                                                <Link className="w-3 h-3 text-[var(--text-faint)]" />
                                                Search by URL
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={eventUrl}
                                                    onChange={(e) => {
                                                        const newUrl = e.target.value;
                                                        setEventUrl(newUrl);
                                                        if (urlPreset) setUrlPreset(null);
                                                        if (selectedPresetSku) setSelectedPresetSku('');
                                                    }}
                                                    placeholder="Paste RobotEvents URL..."
                                                    className="flex-1 min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleEventSearch()}
                                                />
                                                <button
                                                    onClick={handleEventSearch}
                                                    disabled={eventLoading}
                                                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-ink)] px-4 py-2 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2 flex-shrink-0"
                                                >
                                                    {eventLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Search'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card B: Livestream (0 width until an event loads, then expands) */}
                            <div
                                className={`bg-[var(--surface)] border border-[var(--border)] rounded-lg min-w-0 overflow-hidden ${event ? 'p-4 opacity-100' : 'opacity-0 pointer-events-none'}`}
                                style={{ transition: 'opacity 300ms ease' }}
                            >
                                {event && (
                                    <>
                                        {webcastCandidates.length > 0 ? (
                                            <WebcastSelector
                                                candidates={webcastCandidates}
                                                onSelect={handleWebcastSelect}
                                                event={event}
                                            />
                                        ) : (
                                            <LivestreamPanel
                                                event={event}
                                                streams={streams}
                                                onStreamsChange={setStreams}
                                                multiDivisionMode={multiDivisionMode}
                                                onMultiDivisionModeChange={setMultiDivisionMode}
                                                activeDivisionId={activeDivisionId}
                                                onActiveDivisionIdChange={setActiveDivisionId}
                                            />
                                        )}
                                        {noWebcastsFound && !isDetecting && !showStreamSuccess && !streams.some(s => s.videoId) && (
                                            <p className="text-yellow-500 text-xs mt-3 animate-fade-in">
                                                No webcasts found automatically. Paste the stream link above.{' '}
                                                Check <a href={`https://www.robotevents.com/robot-competitions/vex-robotics-competition/${event.sku}.html#webcast`} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text)]">here</a>.
                                            </p>
                                        )}
                                        {showStreamSuccess && (
                                            <div className="flex items-center gap-2 text-green-400 text-sm mt-3 animate-fade-in font-medium">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Streams found and loaded!</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Controls */}
                    <div className="xl:col-span-4 flex flex-col gap-4">

                        {/* Top row: playback controls (left) + Worlds switch (right) */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-h-[38px] flex items-center">
                                {event && streams.length > 0 && (
                                    <SeekControls
                                        onSeek={handleSeek}
                                        onJumpToSyncedStart={() => {
                                            const match = matches.find(m => m.id === selectedMatchId);
                                            if (match) {
                                                jumpToMatch(match);
                                            } else {
                                                alert("No match selected to sync back to.");
                                            }
                                        }}
                                        canControl={!!players[activeStreamId]}
                                    />
                                )}
                            </div>
                            <button
                                onClick={() => onGoToWorlds && onGoToWorlds()}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text)] transition-colors flex-shrink-0"
                                title="Switch to VEX Worlds"
                            >
                                <Globe className="w-4 h-4" />
                                Worlds
                            </button>
                        </div>

                        {/* Sync Control Bar — hidden for now (manual sync WIP) */}
                        {false && event && streams.length > 0 && (
                            <div className="bg-[var(--surface-2)]/30 border-y border-[var(--border)] py-1.5 px-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">Sync Mode</span>
                                    <div className="flex bg-[var(--surface)] rounded-lg p-0.5">
                                        <button
                                            onClick={() => setSyncMode(false)}
                                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${!syncMode
                                                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-sm'
                                                : 'text-[var(--text-faint)] hover:text-[var(--text-2)]'
                                                }`}
                                        >
                                            AUTO
                                        </button>
                                        <button
                                            disabled
                                            title="Coming Soon"
                                            className="px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all text-[var(--text-faint)] opacity-50 cursor-not-allowed"
                                        >
                                            MANUAL
                                        </button>
                                    </div>
                                </div>

                                {syncMode && (
                                    (() => {
                                        // Find first match dynamically for the button label
                                        const getFirstMatch = () => {
                                            const activeStream = getActiveStream();
                                            if (!activeStream) return null;
                                            const targetDivId = activeStream.divisionId;
                                            const targetDayIndex = activeStream.dayIndex;

                                            // Use allMatches (entire event) instead of matches (filtered by selected team)
                                            let relevantMatches = allMatches.length > 0 ? allMatches : matches;
                                            if (targetDivId && event.divisions && event.divisions.length > 1) {
                                                relevantMatches = relevantMatches.filter(m => m.division.id === targetDivId);
                                            }

                                            if (relevantMatches.length === 0) return null;

                                            const eventStart = new Date(event.start);
                                            const streamDate = new Date(eventStart);
                                            streamDate.setDate(eventStart.getDate() + targetDayIndex);
                                            const streamDateStr = streamDate.toISOString().split('T')[0];

                                            return relevantMatches
                                                .filter(m => m.started && m.started.startsWith(streamDateStr))
                                                .sort((a, b) => new Date(a.started) - new Date(b.started))[0];
                                        };

                                        const firstMatch = getFirstMatch();

                                        const handleManualSync = () => {
                                            const activeStream = getActiveStream();
                                            const firstMatch = getFirstMatch();

                                            if (activeStream && firstMatch) {
                                                const player = players[activeStream.id];
                                                if (player && typeof player.getCurrentTime === 'function') {
                                                    const currentVidTime = player.getCurrentTime();
                                                    const matchStartTimeMs = new Date(firstMatch.started).getTime();
                                                    const calculatedStartTime = matchStartTimeMs - (currentVidTime * 1000);

                                                    console.log("Manual Sync:", {
                                                        firstMatch: firstMatch.name,
                                                        matchStart: firstMatch.started,
                                                        vidTime: currentVidTime,
                                                        calcStart: new Date(calculatedStartTime).toISOString()
                                                    });

                                                    const updatedStreams = streams.map(s => {
                                                        if (s.id === activeStream.id) {
                                                            return { ...s, streamStartTime: calculatedStartTime };
                                                        }
                                                        return s;
                                                    });
                                                    setStreams(updatedStreams);
                                                    setManualSyncConfirmed(true); // Enable jumping
                                                    alert(`Synced to ${firstMatch.name}! All matches are now aligned.`);
                                                } else {
                                                    alert("Video player not ready.");
                                                }
                                            } else {
                                                alert("Could not find a match to sync with.");
                                            }
                                        };

                                        return (
                                            <button
                                                onClick={handleManualSync}
                                                disabled={!firstMatch}
                                                className="text-[10px] font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--accent-ink)] px-2 py-1 rounded transition-colors"
                                            >
                                                {firstMatch ? `SYNC TO ${firstMatch.name.toUpperCase()}` : 'NO MATCHES FOUND'}
                                            </button>
                                        );
                                    })()
                                )}
                            </div>
                        )}
                        <div className="seg-toggle flex-shrink-0">
                            {/* Only show 'Find Team' tab if event is loaded OR it's been explicitly selected (though deprecated in no-event mode) */}
                            {event && (
                                <button
                                    onClick={() => setActiveTab('search')}
                                    className={activeTab === 'search' ? 'active' : ''}
                                >
                                    Find Team
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab('list')}
                                className={activeTab === 'list' ? 'active' : ''}
                            >
                                {event ? 'Team List' : 'Search by Team'}
                            </button>
                            {event && (
                                <button
                                    onClick={() => setActiveTab('matches')}
                                    className={activeTab === 'matches' ? 'active' : ''}
                                >
                                    Matches
                                </button>
                            )}
                        </div>

                        {/* Tab Content Panel */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col">
                            {activeTab === 'search' ? (
                                <>
                                    {/* Search Header */}
                                    <div className="p-5 border-b border-[var(--border)] space-y-3 flex-shrink-0 bg-[var(--surface)] z-10 rounded-t-lg">
                                        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Find Team</h2>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={teamNumber}
                                                onChange={(e) => setTeamNumber(e.target.value)}
                                                placeholder="Team number (e.g., 8977A)"
                                                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                                                onKeyDown={(e) => e.key === 'Enter' && handleTeamSearch()}
                                            />
                                            <button
                                                onClick={() => handleTeamSearch()}
                                                disabled={teamLoading || !event}
                                                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-ink)] px-4 py-2 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                                            >
                                                {teamLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Search'}
                                            </button>
                                        </div>
                                        {team && (
                                            <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="text-[var(--text)] font-semibold text-sm">{team.number} - {team.team_name}</p>
                                                        <p className="text-xs text-[var(--text-muted)]">{team.organization}</p>
                                                    </div>
                                                    {matches.length > 0 && matches[0].division && multiDivisionMode && (
                                                        <span className="text-[10px] font-semibold px-2 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                                                            {matches[0].division.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {team.grade && (
                                                    <p className="text-xs text-cyan-400 mt-1">
                                                        {team.grade} {team.program?.code && `• ${team.program.code}`}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Matches List */}
                                    <div className="overflow-y-auto px-4 pb-4 h-[600px]">
                                        {matches.length > 0 ? (
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center sticky top-0 bg-[var(--surface)] pb-2 z-10 pt-4">
                                                    <h2 className="text-sm font-semibold text-[var(--text)]">Matches</h2>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2 text-[10px]">
                                                            {(() => {
                                                                const syncedStreams = streams.filter(s => s.streamStartTime);
                                                                // If manual mode but not confirmed, treat as NOT synced
                                                                const isSynced = (syncMode && !manualSyncConfirmed) ? false : syncedStreams.length > 0;
                                                                return (
                                                                    <>
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-[var(--accent)] shadow-[0_0_8px_rgba(79,206,236,0.6)]' : 'bg-red-500'}`} />
                                                                        <span className="text-[var(--text-muted)]">
                                                                            {isSynced ? 'Synced' : 'Not Synced'}
                                                                        </span>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {(() => {
                                                    // Group matches by day
                                                    const matchesByDay = {};
                                                    matches.forEach(match => {
                                                        // Use inferMatchDayFromContext to handle matches without timestamps
                                                        const dayIndex = inferMatchDayFromContext(match, matches, event?.start);
                                                        if (!matchesByDay[dayIndex]) {
                                                            matchesByDay[dayIndex] = [];
                                                        }
                                                        matchesByDay[dayIndex].push(match);
                                                    });

                                                    return Object.keys(matchesByDay).sort().map((dayIndex) => {
                                                        const dayMatches = matchesByDay[dayIndex];
                                                        const dayStream = streams.find(s => s.dayIndex === parseInt(dayIndex));
                                                        const dayLabel = dayStream?.label || `Day ${parseInt(dayIndex) + 1}`;

                                                        return (
                                                            <div key={dayIndex}>
                                                                {/* Day Header */}
                                                                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-[var(--surface)]/95 backdrop-blur py-2 z-10 -mx-4 px-4">
                                                                    <div className="flex-1 h-px bg-[var(--surface-3)]"></div>
                                                                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                                                                        {dayLabel}
                                                                    </span>
                                                                    <div className="flex-1 h-px bg-[var(--surface-3)]"></div>
                                                                </div>

                                                                {/* Matches for this day */}
                                                                <div className="space-y-2 mb-4">
                                                                    {dayMatches.map((match, index) => {
                                                                        const hasStarted = !!match.started;
                                                                        // Fix: Ensure ID comparison is robust, check both ID and Number, and fallback to Name
                                                                        const alliance = match.alliances?.find(a => a.teams?.some(t =>
                                                                            String(t.team?.id) === String(team?.id) ||
                                                                            t.team?.number === team?.number ||
                                                                            t.team?.name === team?.number // Fallback if name holds the number
                                                                        ));

                                                                        const opponentAlliance = match.alliances?.find(a => a !== alliance);
                                                                        const matchName = match.name?.replace(/teamwork/gi, 'Qual') || match.name;

                                                                        // Check if match is available
                                                                        const grayOutReason = getGrayOutReason(match, streams, event?.start);
                                                                        const isGrayedOut = !!grayOutReason;
                                                                        const matchStream = findStreamForMatch(match, streams, event?.start);
                                                                        const canJump = matchStream && matchStream.streamStartTime;
                                                                        const isExpanded = expandedMatchId === match.id;


                                                                        // W/L Indicator Logic
                                                                        const isVIQC = event?.program?.code === 'VIQC' || event?.program?.code === 'VIQRC';
                                                                        let resultIndicator = null;
                                                                        if (hasStarted && alliance && opponentAlliance && !isVIQC) {
                                                                            const userScore = alliance.score;
                                                                            const opponentScore = opponentAlliance.score;
                                                                            if (userScore > opponentScore) {
                                                                                resultIndicator = <span className="text-[10px] font-semibold text-green-400 ml-1">W</span>;
                                                                            } else if (userScore < opponentScore) {
                                                                                resultIndicator = <span className="text-[10px] font-semibold text-red-400 ml-1">L</span>;
                                                                            } else {
                                                                                resultIndicator = <span className="text-[10px] font-semibold text-[var(--text-muted)] ml-1">T</span>;
                                                                            }
                                                                        }

                                                                        return (
                                                                            <div
                                                                                key={match.id}
                                                                                className={`rounded-lg border transition-all overflow-hidden ${selectedMatchId === match.id
                                                                                    ? 'bg-[var(--accent)]/20 border-[var(--accent)]'
                                                                                    : isGrayedOut
                                                                                        ? 'bg-[var(--surface)] border-[var(--border)] opacity-50'
                                                                                        : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border)]'
                                                                                    }`}
                                                                                title={isGrayedOut ? grayOutReason : ''}
                                                                            >
                                                                                <div className="p-3 flex justify-between items-center gap-2">
                                                                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedMatchId(isExpanded ? null : match.id)}>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <h4 className="font-semibold text-[var(--text)] text-sm truncate">{matchName}</h4>
                                                                                            {alliance && (
                                                                                                <div className="flex items-center">
                                                                                                    <div className={`w-2 h-2 rounded-full ${alliance.color === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} title={`${alliance.color} alliance`} />
                                                                                                    {resultIndicator}
                                                                                                </div>
                                                                                            )}
                                                                                            {isExpanded ? <ChevronUp className="w-3 h-3 text-[var(--text-faint)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-faint)]" />}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-2 mt-1">
                                                                                            <p className="text-xs text-[var(--text-muted)]">
                                                                                                {hasStarted ? format(new Date(match.started), 'h:mm a') : (match.scheduled ? format(new Date(match.scheduled), 'h:mm a') : 'TBD')}
                                                                                            </p>
                                                                                            {hasStarted && alliance && opponentAlliance && renderScore(match, alliance, opponentAlliance)}
                                                                                        </div>
                                                                                    </div>

                                                                                    {canJump ? (
                                                                                        <button
                                                                                            onClick={() => jumpToMatch(match)}
                                                                                            disabled={!hasStarted || isGrayedOut}
                                                                                            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-ink)] p-2 rounded-lg flex-shrink-0 transition-colors"
                                                                                            title="Jump to match"
                                                                                        >
                                                                                            <Play className="w-3 h-3 fill-current" />
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setSelectedMatchId(match.id);
                                                                                                setSyncMode(true);
                                                                                            }}
                                                                                            disabled={!hasStarted || isGrayedOut}
                                                                                            className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-50 text-[var(--text)] p-2 rounded-lg flex-shrink-0 transition-colors"
                                                                                            title="Sync match"
                                                                                        >
                                                                                            <RefreshCw className="w-3 h-3" />
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={async (e) => {
                                                                                            const btn = e.currentTarget;
                                                                                            try {
                                                                                                const url = new URL(window.location.href);
                                                                                                url.searchParams.set('match', match.id);
                                                                                                if (team?.number) url.searchParams.set('team', team.number);

                                                                                                // Try modern clipboard API first
                                                                                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                                                                                    await navigator.clipboard.writeText(url.toString());
                                                                                                } else {
                                                                                                    // Fallback for older browsers
                                                                                                    const textArea = document.createElement('textarea');
                                                                                                    textArea.value = url.toString();
                                                                                                    textArea.style.position = 'fixed';
                                                                                                    textArea.style.left = '-9999px';
                                                                                                    document.body.appendChild(textArea);
                                                                                                    textArea.select();
                                                                                                    document.execCommand('copy');
                                                                                                    document.body.removeChild(textArea);
                                                                                                }

                                                                                                // Success feedback
                                                                                                btn.classList.add('text-green-400');
                                                                                                setTimeout(() => btn.classList.remove('text-green-400'), 1000);
                                                                                            } catch (err) {
                                                                                                console.error('Failed to copy:', err);
                                                                                                btn.classList.add('text-red-400');
                                                                                                setTimeout(() => btn.classList.remove('text-red-400'), 1000);
                                                                                            }
                                                                                        }}
                                                                                        className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)] p-2 rounded-lg flex-shrink-0 transition-colors"
                                                                                        title="Copy link to match"
                                                                                    >
                                                                                        <Share2 className="w-3 h-3" />
                                                                                    </button>
                                                                                </div>

                                                                                {/* Expanded Team Details */}
                                                                                {isExpanded && (
                                                                                    <div className="bg-[var(--surface)]/50 border-t border-[var(--border)] p-3 text-xs space-y-2">
                                                                                        {/* Alliance Teams (or All Teams for VIQC) */}
                                                                                        {(isVIQC ? (match.alliances || []) : (alliance ? [alliance] : [])).length > 0 && (
                                                                                            <div>
                                                                                                <p className="text-[var(--text-faint)] font-semibold mb-1">{isVIQC ? 'Teams' : 'Alliance'}</p>
                                                                                                <div className="flex flex-wrap gap-2">
                                                                                                    {(isVIQC ? match.alliances.flatMap(a => a.teams) : alliance?.teams)?.map(t => {
                                                                                                        if (!t?.team) return null;
                                                                                                        const teamLabel = t.team.number || t.team.name;
                                                                                                        return (
                                                                                                            <button
                                                                                                                key={t.team.id || Math.random()}
                                                                                                                onClick={() => handleTeamSearch(teamLabel)}
                                                                                                                className={`px-2 py-1 rounded border ${String(t.team.id) === String(team?.id)
                                                                                                                    ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]'
                                                                                                                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}
                                                                                                            >
                                                                                                                {teamLabel}
                                                                                                            </button>
                                                                                                        );
                                                                                                    })}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}

                                                                                        {/* Opponent Teams (only if not VIQC) */}
                                                                                        {!isVIQC && opponentAlliance && (
                                                                                            <div>
                                                                                                <p className="text-[var(--text-faint)] font-semibold mb-1">Opponents</p>
                                                                                                <div className="flex flex-wrap gap-2">
                                                                                                    {opponentAlliance.teams?.map(t => {
                                                                                                        if (!t?.team) return null;
                                                                                                        const teamLabel = t.team.number || t.team.name;
                                                                                                        return (
                                                                                                            <button
                                                                                                                key={t.team.id || Math.random()}
                                                                                                                onClick={() => handleTeamSearch(teamLabel)}
                                                                                                                className="px-2 py-1 rounded border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                                                                                                            >
                                                                                                                {teamLabel}
                                                                                                            </button>
                                                                                                        );
                                                                                                    })}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-[var(--text-faint)] space-y-2">
                                                <div className="p-3 bg-[var(--surface-2)]/50 rounded-full">
                                                    <Zap className="w-6 h-6 opacity-50" />
                                                </div>
                                                <p className="text-sm">Search for a team to see matches</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : activeTab === 'matches' ? (
                                <>
                                    {/* Matches Tab Header */}
                                    <div className="p-4 border-b border-[var(--border)] space-y-3 flex-shrink-0 bg-[var(--surface)] z-10 rounded-t-lg">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={matchesTabState.search}
                                                onChange={(e) => setMatchesTabState(prev => ({ ...prev, search: e.target.value }))}
                                                placeholder="Search matches (e.g. #10, R16, 1698, 11101B)"
                                                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            {/* Division toggle (multi-division events only) */}
                                            {multiDivisionMode && event?.divisions?.length > 1 && (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-16 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Division</span>
                                                    <div className="flex-1 flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-0.5 min-w-0">
                                                        {event.divisions.map((div) => (
                                                            <button
                                                                key={div.id}
                                                                onClick={() => setActiveDivisionId(div.id)}
                                                                className={`flex-1 min-w-0 px-2 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors truncate ${activeDivisionId === div.id
                                                                    ? 'bg-purple-600 text-white'
                                                                    : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
                                                                    }`}
                                                            >
                                                                {div.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Sort-by toggle (match type) */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-16 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Sort by</span>
                                                <div className="flex-1 flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-0.5 min-w-0">
                                                    {[
                                                        { key: 'all', label: 'All Matches' },
                                                        { key: 'quals', label: 'Quals' },
                                                        { key: 'elim', label: 'Elims' },
                                                    ].map(({ key, label }) => (
                                                        <button
                                                            key={key}
                                                            onClick={() => setMatchesTabState(prev => ({ ...prev, filter: key }))}
                                                            className={`flex-1 min-w-0 px-2 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap truncate transition-colors ${matchesTabState.filter === key
                                                                ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                                                                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
                                                                }`}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Full Matches List */}
                                    <div className="overflow-y-auto px-4 pb-4 h-[600px]">
                                        {allMatchesLoading ? (
                                            <div className="flex justify-center py-8">
                                                <Loader className="w-8 h-8 animate-spin text-[var(--accent)]" />
                                            </div>
                                        ) : allMatches.length > 0 ? (
                                            (() => {
                                                // Filter logic
                                                const filteredMatches = allMatches.filter(match => {
                                                    // Filter by division
                                                    if (multiDivisionMode) {
                                                        if (activeDivisionId && match.division?.id !== activeDivisionId) return false;
                                                    } else if (event?.divisions?.length > 1) {
                                                        // If multi-division event but mode is OFF, default to first division
                                                        if (match.division?.id !== event.divisions[0].id) return false;
                                                    }

                                                    // Filter by type - handle practice matches as part of quals
                                                    const matchNameLower = match.name.toLowerCase();
                                                    const isQualOrPractice = matchNameLower.includes('qual') || matchNameLower.includes('practice') || matchNameLower.includes('teamwork');
                                                    if (matchesTabState.filter === 'quals' && !isQualOrPractice) return false;
                                                    if (matchesTabState.filter === 'elim' && isQualOrPractice) return false;

                                                    // Search logic
                                                    if (matchesTabState.search) {
                                                        const term = matchesTabState.search.toLowerCase();
                                                        const matchNameMatch = match.name.toLowerCase().includes(term);
                                                        const teamMatch = match.alliances.some(a =>
                                                            a.teams.some(t => {
                                                                if (!t.team) return false;
                                                                return (t.team.number || '').toLowerCase().includes(term) ||
                                                                    (t.team.name || '').toLowerCase().includes(term);
                                                            })
                                                        );
                                                        return matchNameMatch || teamMatch;
                                                    }
                                                    return true;
                                                });

                                                if (filteredMatches.length === 0) {
                                                    return (
                                                        <div className="text-center py-8 text-[var(--text-faint)]">
                                                            <p>No matches found matching your filters.</p>
                                                        </div>
                                                    );
                                                }

                                                // Group by day using inferMatchDayFromContext for proper day calculation
                                                const matchesByDay = {};
                                                filteredMatches.forEach(match => {
                                                    // Use all matches (not just filtered) for context when inferring day
                                                    const dayIndex = inferMatchDayFromContext(match, allMatches, event?.start);
                                                    if (!matchesByDay[dayIndex]) matchesByDay[dayIndex] = [];
                                                    matchesByDay[dayIndex].push(match);
                                                });

                                                return (
                                                    <div className="space-y-6 pt-4">
                                                        {Object.keys(matchesByDay).sort().map((dayIndex) => {
                                                            const dayMatches = matchesByDay[dayIndex];
                                                            const dayStream = streams.find(s => s.dayIndex === parseInt(dayIndex));
                                                            const dayLabel = dayStream?.label || `Day ${parseInt(dayIndex) + 1}`;

                                                            return (
                                                                <div key={dayIndex}>
                                                                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-[var(--surface)]/95 backdrop-blur py-2 z-10 -mx-4 px-4">
                                                                        <div className="flex-1 h-px bg-[var(--surface-3)]"></div>
                                                                        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                                                                            {dayLabel}
                                                                        </span>
                                                                        <div className="flex-1 h-px bg-[var(--surface-3)]"></div>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {dayMatches.map((match) => {
                                                                            const matchName = match.name?.replace(/teamwork/gi, 'Qual') || match.name;
                                                                            const grayOutReason = getGrayOutReason(match, streams, event?.start);

                                                                            // Helper to check if a specific team is in this match (for highlighting)
                                                                            const isSearchedTeam = (t) => {
                                                                                if (!matchesTabState.search) return false;
                                                                                const term = matchesTabState.search.toLowerCase();
                                                                                if (!/\d/.test(term)) return false;
                                                                                if (!t.team) return false;
                                                                                return (t.team.number || '').toLowerCase().includes(term) ||
                                                                                    (t.team.name || '').toLowerCase().includes(term);
                                                                            };

                                                                            return (
                                                                                <div
                                                                                    key={match.id}
                                                                                    className={`bg-[var(--surface)] border rounded-lg p-3 transition-colors ${grayOutReason ? 'border-[var(--border)] opacity-60' :
                                                                                        selectedMatchId === match.id ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                                                                                        }`}
                                                                                >
                                                                                    <div className="flex justify-between items-start mb-2">
                                                                                        <div>
                                                                                            <span className="font-semibold text-[var(--accent)]">{matchName}</span>
                                                                                            <span className="text-[var(--text-faint)] text-xs ml-2">
                                                                                                {match.started ? format(new Date(match.started), 'h:mm a') :
                                                                                                    match.scheduled ? format(new Date(match.scheduled), 'h:mm a') : 'Scheduled'}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            <button
                                                                                                onClick={() => jumpToMatch(match)}
                                                                                                disabled={!!grayOutReason}
                                                                                                className={`p-1.5 rounded-md transition-colors ${grayOutReason
                                                                                                    ? 'text-[var(--text-faint)] cursor-not-allowed'
                                                                                                    : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
                                                                                                    }`}
                                                                                                title={grayOutReason || "Jump to match"}
                                                                                            >
                                                                                                <Play className="w-3 h-3 fill-current" />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={async (e) => {
                                                                                                    const btn = e.currentTarget;
                                                                                                    try {
                                                                                                        const url = new URL(window.location.href);
                                                                                                        url.searchParams.set('match', match.id);

                                                                                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                                                                                            await navigator.clipboard.writeText(url.toString());
                                                                                                        } else {
                                                                                                            const textArea = document.createElement('textarea');
                                                                                                            textArea.value = url.toString();
                                                                                                            textArea.style.position = 'fixed';
                                                                                                            textArea.style.left = '-9999px';
                                                                                                            document.body.appendChild(textArea);
                                                                                                            textArea.select();
                                                                                                            document.execCommand('copy');
                                                                                                            document.body.removeChild(textArea);
                                                                                                        }

                                                                                                        btn.classList.add('text-green-400');
                                                                                                        setTimeout(() => btn.classList.remove('text-green-400'), 1000);
                                                                                                    } catch (err) {
                                                                                                        console.error('Failed to copy:', err);
                                                                                                        btn.classList.add('text-red-400');
                                                                                                        setTimeout(() => btn.classList.remove('text-red-400'), 1000);
                                                                                                    }
                                                                                                }}
                                                                                                className="p-1.5 rounded-md transition-colors bg-[var(--surface-2)]/50 text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
                                                                                                title="Copy link to match"
                                                                                            >
                                                                                                <Share2 className="w-3 h-3" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                                                                        {match.alliances.map((alliance) => (
                                                                                            <div key={alliance.color} className={`flex flex-col ${alliance.color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                                                                                                {/* Score at top of column */}
                                                                                                <div className="flex justify-between items-end border-b border-[var(--border)] pb-1 mb-1">
                                                                                                    <span className="font-mono text-lg font-semibold opacity-90">{alliance.score}</span>
                                                                                                </div>
                                                                                                {/* Teams list */}
                                                                                                <div className="flex flex-col gap-1">
                                                                                                    {alliance.teams.map((t) => (
                                                                                                        <button
                                                                                                            key={t.team.id || Math.random()}
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation();
                                                                                                                const teamNum = t.team.number || t.team.name;
                                                                                                                setActiveTab('search');
                                                                                                                setTeamNumber(teamNum);
                                                                                                                handleTeamSearch(teamNum);
                                                                                                            }}
                                                                                                            className={`text-left hover:underline cursor-pointer transition-all ${isSearchedTeam(t) ? 'bg-white/10 rounded px-1 -mx-1 font-semibold text-[var(--text)]' : 'hover:text-[var(--text)]'}`}
                                                                                                        >
                                                                                                            {/* Fallback to name if number is missing */}
                                                                                                            {t.team.number || t.team.name}
                                                                                                        </button>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            <div className="text-center py-8 text-[var(--text-faint)]">
                                                <p>No matches found for this event.</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : activeTab === 'list' ? (
                                event ? (
                                    <TeamList
                                        event={event}
                                        onTeamSelect={handleTeamSearch}
                                        multiDivisionMode={multiDivisionMode}
                                        teams={teams}
                                        rankings={rankings}
                                        skills={skills}
                                        loading={rankingsLoading}
                                        divisionsFromPreset={divisionsFromPreset}
                                    />
                                ) : (
                                    // Global Team Search View (No Event Loaded)
                                    <div className="flex flex-col h-full">
                                        <div className="p-4 border-b border-[var(--border)] space-y-4">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={teamNumber}
                                                    onChange={(e) => setTeamNumber(e.target.value)}
                                                    placeholder="Team Number (e.g. 1698V)"
                                                    className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleTeamSearch()}
                                                />
                                                <button
                                                    onClick={() => handleTeamSearch()}
                                                    disabled={isGlobalSearchLoading}
                                                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-ink)] px-4 py-2 rounded-lg font-semibold text-sm"
                                                >
                                                    {isGlobalSearchLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Search'}
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="includePastSeasons"
                                                    checked={includePastSeasons}
                                                    onChange={(e) => setIncludePastSeasons(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-gray-900"
                                                />
                                                <label htmlFor="includePastSeasons" className="text-xs text-[var(--text-muted)] select-none cursor-pointer">
                                                    Show all seasons
                                                </label>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[600px]">
                                            {isGlobalSearchLoading ? (
                                                <div className="flex justify-center py-8">
                                                    <Loader className="w-8 h-8 animate-spin text-[var(--accent)]" />
                                                </div>
                                            ) : globalTeamEvents.length > 0 ? (
                                                globalTeamEvents.map(evt => (
                                                    <button
                                                        key={evt.id}
                                                        onClick={async () => {
                                                            setEventUrl(`https://www.robotevents.com/${evt.sku}.html`);
                                                            // Trigger search logic manually or leverage existing effect
                                                            // For direct action:
                                                            setEventLoading(true);
                                                            try {
                                                                const fullEvent = await getEventBySku(evt.sku);
                                                                setEvent(fullEvent);
                                                                setEventUrl(`https://www.robotevents.com/${evt.sku}.html`);
                                                                await initializeStreamsForEvent(fullEvent);
                                                                setUrlSku(evt.sku);
                                                                setIsEventSearchCollapsed(true); // Collapse event search after loading
                                                            } catch (err) {
                                                                setError(err.message);
                                                            } finally {
                                                                setEventLoading(false);
                                                            }
                                                        }}
                                                        className="w-full bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)]/50 rounded-lg p-3 text-left group transition-all"
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)] line-clamp-1 text-sm">{evt.name}</span>
                                                            <span className="text-[10px] font-semibold bg-[var(--surface-3)] text-[var(--text-2)] px-1.5 py-0.5 rounded uppercase">{evt.program?.code || 'VRC'}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 mt-2">
                                                            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                                                <Globe className="w-3 h-3" /> {evt.location?.city}, {evt.location?.region}
                                                            </span>
                                                            <span className="text-xs text-[var(--text-faint)]">
                                                                {new Date(evt.start).toLocaleDateString()} - {new Date(evt.end).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                !isGlobalSearchLoading && (
                                                    <div className="flex flex-col items-center justify-center h-48 text-[var(--text-faint)] opacity-50">
                                                        <Search className="w-12 h-12 mb-2" />
                                                        <p className="text-xs">Search for a team to view all their events</p>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Sync Modal */}
                {syncMode && selectedMatchId && (
                    <div className="fixed inset-0 bg-[var(--surface-2)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                        <div className="bg-[var(--surface)] border-2 border-[var(--accent)] p-8 rounded-lg max-w-md text-center  shadow-[var(--accent)]/20">
                            <h3 className="text-2xl font-semibold text-[var(--accent)] mb-4">Manual Sync</h3>
                            <p className="text-[var(--text-2)] mb-6">
                                Find the exact moment <strong className="text-[var(--text)]">{matches.find(m => m.id === selectedMatchId)?.name}</strong> starts in the video, then click SYNC NOW.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => handleManualSync(matches.find(m => m.id === selectedMatchId))}
                                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] px-8 py-3 rounded-lg font-semibold transition-colors"
                                >
                                    SYNC NOW
                                </button>
                                <button
                                    onClick={() => setSyncMode(false)}
                                    className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] px-6 py-3 rounded-lg font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Event History Modal */}
                <EventHistory
                    isOpen={showEventHistory}
                    onClose={() => setShowEventHistory(false)}
                    onSelectEvent={handleLoadFromHistory}
                />

            </main>
        </div>
    );
}

export default Viewer;
