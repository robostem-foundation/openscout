import React from 'react';
import { Loader, Trash2 } from 'lucide-react';
import { extractVideoId } from '../services/youtube';

const StreamInput = ({
    stream,
    index,
    onUrlChange,
    onLoad,
    onRemove,
    isActive,
    canRemove = false
}) => {
    const [localUrl, setLocalUrl] = React.useState(stream.url || '');
    const [loading, setLoading] = React.useState(false);

    const handleLoad = async () => {
        setLoading(true);
        const videoId = extractVideoId(localUrl);

        if (videoId) {
            await onLoad(index, localUrl, videoId);
            setLoading(false);
        } else {
            alert('Invalid YouTube URL');
            setLoading(false);
        }
    };

    const handleUrlInputChange = (e) => {
        const newUrl = e.target.value;
        setLocalUrl(newUrl);
        onUrlChange(index, newUrl);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[var(--accent)]">
                    {stream.label}
                    {isActive && <span className="ml-2 text-xs text-green-400">● Active</span>}
                </label>
                {canRemove && (
                    <button
                        onClick={() => onRemove(index)}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                        <Trash2 className="w-3 h-3" /> Remove
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={localUrl}
                    onChange={handleUrlInputChange}
                    className="flex-1 bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-lg px-4 py-2 text-[var(--text)] text-sm outline-none transition-colors"
                    placeholder="https://youtube.com/watch?v=... or youtube.com/live/..."
                />
                <button
                    onClick={handleLoad}
                    disabled={loading || !localUrl}
                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--accent-ink)] px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
                >
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Load'}
                </button>
            </div>
        </div>
    );
};

export default StreamInput;
