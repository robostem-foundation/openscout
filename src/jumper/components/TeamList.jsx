import React, { useState, useEffect } from 'react';
import { Globe, Loader, Search, AlertTriangle, ListOrdered, Gauge } from 'lucide-react';
import { getTeamsForEvent, getRankingsForEvent, getSkillsForEvent, getWorldSkillsLeaderboard } from '../services/robotevents';

const TeamList = ({ event, onTeamSelect, multiDivisionMode, divisionsFromPreset }) => {
    const [teams, setTeams] = useState([]);
    const [rankings, setRankings] = useState({});
    const [skills, setSkills] = useState({});
    const [worldSkills, setWorldSkills] = useState({});
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('default'); // default, rank, skills, world_skills
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState(null);

    useEffect(() => {
        if (!event) return;
        loadData();
    }, [event]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Teams
            const teamsData = await getTeamsForEvent(event.id);
            setTeams(teamsData);

            // 2. Fetch Event Rankings
            // Pass event.divisions so the API can fetch from division-specific endpoints if needed
            const rankingsData = await getRankingsForEvent(event.id, event.divisions || []);
            const rankingsMap = {};
            rankingsData.forEach(r => {
                if (r.team) {
                    rankingsMap[r.team.id] = {
                        rank: r.rank,
                        wins: r.wins,
                        losses: r.losses,
                        ties: r.ties,
                        wp: r.wp,
                        ap: r.ap,
                        sp: r.sp,
                        division: r.division // Capture division info
                    };
                }
            });
            setRankings(rankingsMap);

            // 3. Fetch Event Skills
            const skillsData = await getSkillsForEvent(event.id);
            const skillsMap = {};
            skillsData.forEach(s => {
                if (s.team) {
                    // Skills endpoint returns multiple entries (driver, programming, etc.)
                    // We want the combined score usually, or the highest rank
                    // The API returns 'rank' field for combined skills entries
                    if (s.type === 'driver' || s.type === 'programming') return; // Skip individual if combined exists
                    // Actually, usually type is 'skills' for combined or we look for rank
                    // Let's just map by team ID and store the rank and score
                    if (!skillsMap[s.team.id] || s.score > skillsMap[s.team.id].score) {
                        skillsMap[s.team.id] = { rank: s.rank, score: s.score };
                    }
                }
            });
            // Re-process skills to ensure we have the best rank/score
            // Actually, the /skills endpoint lists all runs. We need to find the entry that represents the ranking.
            // Usually, RobotEvents returns a list where type='driver' or 'programming'.
            // Wait, there is a separate endpoint for skills rankings? No, /skills returns the list.
            // Let's assume the API returns ranked list or we sort it.
            // For now, let's just store the highest score found for the team.

            // Better approach: The /skills endpoint returns a list of skills runs. 
            // We need to aggregate them. Or maybe there is a /skills/rankings endpoint?
            // Checking RobotEvents API docs (mental check): /events/{id}/skills usually returns the list of skills runs.
            // Actually, let's just use the `rank` from the response if available, or sort by score.

            const skillsMapFinal = {};
            // Group by team
            const teamSkills = {};
            skillsData.forEach(s => {
                if (!s.team) return;
                if (!teamSkills[s.team.id]) teamSkills[s.team.id] = { driver: 0, programming: 0, score: 0 };
                if (s.type === 'driver') teamSkills[s.team.id].driver = Math.max(teamSkills[s.team.id].driver, s.score);
                if (s.type === 'programming') teamSkills[s.team.id].programming = Math.max(teamSkills[s.team.id].programming, s.score);
                teamSkills[s.team.id].score = teamSkills[s.team.id].driver + teamSkills[s.team.id].programming;
            });

            // Convert to map with score
            Object.keys(teamSkills).forEach(teamId => {
                skillsMapFinal[teamId] = { score: teamSkills[teamId].score };
            });
            setSkills(skillsMapFinal);


            // 4. Fetch World Skills standings for the event's season. Standings are
            //    per grade level, and an event may be mixed (multiple grades), so we
            //    fetch every grade present among its teams and merge by team id.
            if (event.season?.id) {
                const grades = [...new Set(teamsData.map(t => t.grade).filter(Boolean))];
                const gradesToFetch = grades.length ? grades : ['High School'];
                const boards = await Promise.all(
                    gradesToFetch.map(g => getWorldSkillsLeaderboard(event.season.id, g))
                );
                const worldSkillsMap = {};
                boards.flat().forEach(entry => {
                    const teamId = entry.team?.id;
                    if (teamId == null) return;
                    worldSkillsMap[teamId] = {
                        rank: entry.rank,
                        score: entry.scores?.score,
                        driver: entry.scores?.driver,
                        programming: entry.scores?.programming,
                    };
                });
                setWorldSkills(worldSkillsMap);
            }

        } catch (err) {
            console.error('Error loading team list data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getSortedTeams = () => {
        let filtered = teams;

        // Division Filter
        if (multiDivisionMode && selectedDivisionId) {
            filtered = filtered.filter(t => rankings[t.id]?.division?.id === selectedDivisionId);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.number.toLowerCase().includes(q) ||
                (t.team_name && t.team_name.toLowerCase().includes(q))
            );
        }

        switch (viewMode) {
            case 'rank':
                return [...filtered].sort((a, b) => {
                    const rankA = rankings[a.id]?.rank || 9999;
                    const rankB = rankings[b.id]?.rank || 9999;
                    return rankA - rankB;
                });
            case 'skills':
                return [...filtered].sort((a, b) => {
                    const scoreA = skills[a.id]?.score || 0;
                    const scoreB = skills[b.id]?.score || 0;
                    return scoreB - scoreA;
                });
            case 'world_skills':
                return [...filtered].sort((a, b) => {
                    const rankA = worldSkills[a.id]?.rank || 9999;
                    const rankB = worldSkills[b.id]?.rank || 9999;
                    return rankA - rankB;
                });
            default: // 'default' - sort by number
                return [...filtered].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
        }
    };

    const sortedTeams = getSortedTeams();

    return (
        <div className="h-full flex flex-col bg-[var(--surface)] text-[var(--text)]">
            {/* Header & Filters — toggles first, then the search bar. */}
            <div className="p-4 space-y-3">
                {/* Filters — two full-width segmented toggles with left labels */}
                <div className="space-y-2">
                    {/* Division toggle (multi-division events only) */}
                    {multiDivisionMode && event?.divisions?.length > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="w-16 flex-shrink-0 jmp-label">Division</span>
                            <div className="seg-toggle flex-1 min-w-0">
                                <button
                                    onClick={() => setSelectedDivisionId(null)}
                                    className={!selectedDivisionId ? 'active' : ''}
                                >
                                    All
                                </button>
                                {event.divisions.map((div) => (
                                    <button
                                        key={div.id}
                                        onClick={() => setSelectedDivisionId(div.id)}
                                        className={selectedDivisionId === div.id ? 'active' : ''}
                                    >
                                        {div.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* View-mode toggle */}
                    <div className="flex items-center gap-2">
                        <span className="w-16 flex-shrink-0 jmp-label">Filter by</span>
                        <div className="seg-toggle flex-1 min-w-0">
                            {[
                                { key: 'default', label: 'Team #' },
                                { key: 'rank', label: 'Rank' },
                                { key: 'skills', label: 'Skills' },
                                { key: 'world_skills', label: 'World' },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setViewMode(key)}
                                    className={viewMode === key ? 'active' : ''}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-[var(--surface-2)] p-2 rounded-lg">
                    <Search className="w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search teams..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none focus:outline-none text-sm w-full text-[var(--text)] placeholder-[var(--text-faint)]"
                    />
                </div>
            </div>

            {/* Divisions from Preset Disclaimer */}
            {divisionsFromPreset && (
                <div className="mx-2 mt-2 p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#b7791f] flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-[var(--text-2)]">
                        <span className="font-semibold text-[var(--text)]">Divisions not yet published.</span>
                        <span className="text-[var(--text-muted)] ml-1">The official division assignments are not available from RobotEvents yet. Division filters may not work correctly until they are released.</span>
                    </div>
                </div>
            )}

            {/* Team List */}
            <div className="relative flex-1 min-h-[60vh] xl:min-h-0 flex flex-col">
                <div className="jmp-scrolltop" />
                <div className="overflow-y-auto p-2 space-y-2 flex-1 min-h-0">
                {loading ? (
                    <div className="flex justify-center items-center h-32">
                        <Loader className="w-6 h-6 text-[var(--accent)] animate-spin" />
                    </div>
                ) : sortedTeams.length === 0 ? (
                    <div className="text-center text-[var(--text-faint)] py-8 text-sm">
                        No teams found
                    </div>
                ) : (
                    sortedTeams.map((team, idx) => {
                        const rankingData = rankings[team.id];
                        const skillScore = skills[team.id]?.score;
                        const worldData = worldSkills[team.id];
                        const worldRank = worldData?.rank;

                        return (
                            <button
                                key={team.id}
                                onClick={() => onTeamSelect(team.number)}
                                className="jmp-row group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {viewMode === 'rank' && rankingData && (
                                            <span className="jmp-rank">#{rankingData.rank}</span>
                                        )}
                                        {viewMode === 'skills' && (
                                            <span className="jmp-rank">#{idx + 1}</span>
                                        )}
                                        {viewMode === 'world_skills' && worldData && (
                                            <span className="jmp-rank">#{worldData.rank}</span>
                                        )}
                                        <span className="text-[15px] font-semibold text-[var(--text)] tracking-tight shrink-0">{team.number}</span>
                                        {team.team_name && (
                                            <span className="text-xs text-[var(--text-muted)] truncate">{team.team_name}</span>
                                        )}
                                        {multiDivisionMode && rankingData?.division && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-muted)] shrink-0">
                                                {rankingData.division.name}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center shrink-0">
                                        <div className="flex items-center gap-3">
                                        {viewMode === 'rank' && rankingData ? (
                                            <>
                                                <span className="jmp-record">
                                                    <span className="w">{rankingData.wins}</span>-<span className="l">{rankingData.losses}</span>-<span className="t">{rankingData.ties}</span>
                                                </span>
                                                <span className="jmp-stat"><span className="jmp-label">WP</span><b>{rankingData.wp}</b></span>
                                                <span className="jmp-stat"><span className="jmp-label">AP</span><b>{rankingData.ap}</b></span>
                                                <span className="jmp-stat"><span className="jmp-label">SP</span><b>{rankingData.sp}</b></span>
                                            </>
                                        ) : viewMode === 'world_skills' ? (
                                            worldData && (
                                                <>
                                                    <span className="jmp-stat"><span className="jmp-label">Skills</span><b>{worldData.score ?? '—'}</b></span>
                                                    <span className="jmp-stat"><span className="jmp-label">Driver</span><b>{worldData.driver ?? '—'}</b></span>
                                                    <span className="jmp-stat"><span className="jmp-label">Prog</span><b>{worldData.programming ?? '—'}</b></span>
                                                </>
                                            )
                                        ) : (
                                            <>
                                                {rankingData && (
                                                    <span className="jmp-stat"><ListOrdered className="w-3 h-3 text-[var(--text-faint)]" /><b>#{rankingData.rank}</b></span>
                                                )}
                                                {skillScore !== undefined && (
                                                    <span className="jmp-stat"><Gauge className="w-3 h-3 text-[var(--text-faint)]" /><b>{skillScore}</b></span>
                                                )}
                                            </>
                                        )}
                                        </div>
                                        {/* Search affordance slides in on hover, easing the stats left to make room */}
                                        <div className="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] transition-[grid-template-columns] duration-200 ease-out">
                                            <div className="overflow-hidden">
                                                <Search className="w-3.5 h-3.5 text-[var(--text-faint)] ml-2.5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
                </div>
            </div>
        </div>
    );
};

export default TeamList;
