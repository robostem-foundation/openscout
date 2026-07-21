import React, { useState, useEffect } from 'react';
import { ExternalLink, Play, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { getChannelLivestreams, getPlaylistVideos } from '../services/youtubeAdvanced';
import { isHttpUrl } from '../../safeUrl';

const WebcastSelector = ({ candidates, event, onSelect, inline = false }) => {
    const [expandedChannels, setExpandedChannels] = useState({});
    const [expandedPlaylists, setExpandedPlaylists] = useState({});
    const [channelStreams, setChannelStreams] = useState({});
    const [playlistVideos, setPlaylistVideos] = useState({});
    const [loading, setLoading] = useState({});
    const [manualUrl, setManualUrl] = useState('');
    const [showManual, setShowManual] = useState(false);

    const handleChannelExpand = async (url) => {
        if (expandedChannels[url]) {
            setExpandedChannels(prev => ({ ...prev, [url]: false }));
            return;
        }

        setLoading(prev => ({ ...prev, [url]: true }));
        try {
            const streams = await getChannelLivestreams(url);
            setChannelStreams(prev => ({ ...prev, [url]: streams }));
            setExpandedChannels(prev => ({ ...prev, [url]: true }));
        } catch (error) {
            console.error('Error fetching channel streams:', error);
            alert(`Could not fetch streams from this channel: ${error.message}`);
        } finally {
            setLoading(prev => ({ ...prev, [url]: false }));
        }
    };

    const handlePlaylistExpand = async (url) => {
        if (expandedPlaylists[url]) {
            setExpandedPlaylists(prev => ({ ...prev, [url]: false }));
            return;
        }

        setLoading(prev => ({ ...prev, [url]: true }));
        try {
            const videos = await getPlaylistVideos(url, event?.start);
            setPlaylistVideos(prev => ({ ...prev, [url]: videos }));
            setExpandedPlaylists(prev => ({ ...prev, [url]: true }));
        } catch (error) {
            console.error('Error fetching playlist videos:', error);
            alert(`Could not fetch videos from this playlist: ${error.message}`);
        } finally {
            setLoading(prev => ({ ...prev, [url]: false }));
        }
    };

    const handleSelect = (url, videoId) => {
        onSelect(videoId, url, 'user-selected');
    };

    const handleManualSubmit = () => {
        if (!manualUrl) return;
        const videoIdMatch = manualUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (videoIdMatch) {
            onSelect(videoIdMatch[1], manualUrl, 'manual-input');
        } else {
            alert('Invalid YouTube URL');
        }
    };

    // Group candidates by type
    const directVideos = candidates.filter(c => c.type === 'direct-video');
    const channels = candidates.filter(c => c.type === 'channel');
    const playlists = candidates.filter(c => c.type === 'playlist');
    const others = candidates.filter(c => c.type === 'other');

    return (
        <div className="space-y-3">
            {/* Direct Video Links */}
            {directVideos.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase">Direct Videos</h4>
                    <div className="space-y-2">
                        {directVideos.map((candidate, idx) => (
                            <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] p-2 rounded-lg flex items-center justify-between hover:border-[var(--accent)] transition-colors">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[var(--text)] text-xs font-mono truncate">{candidate.url}</p>
                                    <p className="text-[10px] text-[var(--text-faint)]">From: {candidate.source}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const videoIdMatch = candidate.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                                        if (videoIdMatch) handleSelect(candidate.url, videoIdMatch[1]);
                                    }}
                                    className="ml-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] px-3 py-1 rounded font-semibold text-xs flex items-center gap-1 shrink-0"
                                >
                                    <Play className="w-3 h-3" /> Use
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Channel Links */}
            {channels.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase">YouTube Channels</h4>
                    <div className="space-y-2">
                        {channels.map((candidate, idx) => (
                            <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                                <div className="p-2 flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[var(--text)] text-xs font-mono truncate">{candidate.url}</p>
                                        <p className="text-[10px] text-[var(--text-faint)]">From: {candidate.source}</p>
                                    </div>
                                    <button
                                        onClick={() => handleChannelExpand(candidate.url)}
                                        disabled={loading[candidate.url]}
                                        className="ml-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] px-3 py-1 rounded font-semibold text-xs flex items-center gap-1 shrink-0"
                                    >
                                        {loading[candidate.url] ? <Loader className="w-3 h-3 animate-spin" /> :
                                            expandedChannels[candidate.url] ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Streams</>}
                                    </button>
                                </div>
                                {expandedChannels[candidate.url] && channelStreams[candidate.url] && (
                                    <div className="px-2 pb-2 space-y-1 border-t border-[var(--border)] pt-2">
                                        {channelStreams[candidate.url].length === 0 ? (
                                            <p className="text-[var(--text-faint)] text-xs">No live or upcoming streams found</p>
                                        ) : (
                                            channelStreams[candidate.url].map(stream => (
                                                <div key={stream.videoId} className="bg-[var(--surface)] border border-[var(--border)] p-2 rounded flex items-center gap-2">
                                                    <img src={stream.thumbnail} alt={stream.title} className="w-16 h-12 object-cover rounded shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[var(--text)] text-xs font-semibold truncate">{stream.title}</p>
                                                        {stream.upcoming && <span className="text-[10px] text-yellow-400">Upcoming</span>}
                                                    </div>
                                                    <button
                                                        onClick={() => handleSelect(stream.url, stream.videoId)}
                                                        className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] px-2 py-1 rounded font-semibold text-xs shrink-0"
                                                    >
                                                        Use
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Playlist Links */}
            {playlists.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase">YouTube Playlists</h4>
                    <div className="space-y-2">
                        {playlists.map((candidate, idx) => (
                            <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                                <div className="p-2 flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[var(--text)] text-xs font-mono truncate">{candidate.url}</p>
                                        <p className="text-[10px] text-[var(--text-faint)]">From: {candidate.source}</p>
                                    </div>
                                    <button
                                        onClick={() => handlePlaylistExpand(candidate.url)}
                                        disabled={loading[candidate.url]}
                                        className="ml-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] px-3 py-1 rounded font-semibold text-xs flex items-center gap-1 shrink-0"
                                    >
                                        {loading[candidate.url] ? <Loader className="w-3 h-3 animate-spin" /> :
                                            expandedPlaylists[candidate.url] ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Videos</>}
                                    </button>
                                </div>
                                {expandedPlaylists[candidate.url] && playlistVideos[candidate.url] && (
                                    <div className="px-2 pb-2 space-y-1 border-t border-[var(--border)] pt-2">
                                        {playlistVideos[candidate.url].length === 0 ? (
                                            <p className="text-[var(--text-faint)] text-xs">No relevant videos found</p>
                                        ) : (
                                            playlistVideos[candidate.url].map(video => (
                                                <div key={video.videoId} className="bg-[var(--surface)] border border-[var(--border)] p-2 rounded flex items-center gap-2">
                                                    <img src={video.thumbnail} alt={video.title} className="w-16 h-12 object-cover rounded shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[var(--text)] text-xs font-semibold truncate">{video.title}</p>
                                                        <p className="text-[10px] text-[var(--text-faint)]">{new Date(video.publishedAt).toLocaleDateString()}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSelect(video.url, video.videoId)}
                                                        className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] px-2 py-1 rounded font-semibold text-xs shrink-0"
                                                    >
                                                        Use
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Other Links */}
            {others.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase">Other Links</h4>
                    <div className="space-y-1">
                        {others.map((candidate, idx) => (
                            <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] p-2 rounded-lg">
                                {/* Only render http(s) as a clickable link; anything else (a
                                    javascript:/data: URL from stream detection) shows as inert text. */}
                                {isHttpUrl(candidate.url) ? (
                                    <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline text-xs font-mono break-all flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3 shrink-0" /> {candidate.url}
                                    </a>
                                ) : (
                                    <span className="text-[var(--text-muted)] text-xs font-mono break-all flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3 shrink-0" /> {candidate.url}
                                    </span>
                                )}
                                <p className="text-[10px] text-[var(--text-faint)] mt-1">Platform: {candidate.platform} • From: {candidate.source}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual Input Toggle */}
            <div>
                <button
                    onClick={() => setShowManual(!showManual)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1"
                >
                    {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Enter URL manually
                </button>
                {showManual && (
                    <div className="mt-2 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                        <p className="text-[10px] text-[var(--text-muted)] mb-2">Paste YouTube URL:</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                                className="flex-1 bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded px-2 py-1 text-[var(--text)] text-xs outline-none"
                                placeholder="https://youtube.com/watch?v=..."
                            />
                            <button
                                onClick={handleManualSubmit}
                                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] px-3 py-1 rounded font-semibold text-xs"
                            >
                                Use
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WebcastSelector;
