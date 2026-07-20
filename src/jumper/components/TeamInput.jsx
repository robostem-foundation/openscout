import React, { useState } from 'react';
import { Users, ArrowRight, AlertCircle } from 'lucide-react';
import { getTeamByNumber, getMatchesForEventAndTeam } from '../services/robotevents';

const TeamInput = ({ eventId, onMatchesFound }) => {
    const [teamNumber, setTeamNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async () => {
        setLoading(true);
        setError('');

        try {
            const team = await getTeamByNumber(teamNumber);
            const matches = await getMatchesForEventAndTeam(eventId, team.id);

            if (matches.length === 0) {
                throw new Error('No matches found for this team at this event.');
            }

            onMatchesFound(team, matches);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[var(--surface-2)]/50 p-6 rounded-lg border border-[var(--border)] backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" /> Find Team
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-2)] mb-1">
                            Team Number
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={teamNumber}
                                onChange={(e) => setTeamNumber(e.target.value.toUpperCase())}
                                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                                placeholder="e.g. 254A"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={loading || !teamNumber}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text)] px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                            >
                                {loading ? 'Loading...' : <ArrowRight className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeamInput;
