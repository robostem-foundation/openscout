// Utility functions for multi-stream support

/**
 * Calculate the number of days in an event
 */
export const calculateEventDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 1;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Reset to start of day for accurate day counting
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 because same day counts as 1 day

    return diffDays;
};

/**
 * Get day labels for an event
 */
export const getEventDayLabels = (startDate, days) => {
    if (!startDate) return ['Day 1'];

    const labels = [];
    const start = new Date(startDate);

    for (let i = 0; i < days; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);

        const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(`Day ${i + 1} (${monthDay})`);
    }

    return labels;
};

/**
 * Get the day index (0-based) for a match based on its start time
 */
export const getMatchDayIndex = (matchStarted, eventStartDate) => {
    if (!matchStarted || !eventStartDate) return 0;

    // Parse match date (absolute timestamp)
    const matchDate = new Date(matchStarted);

    // Parse event start date string (YYYY-MM-DD) directly to local components
    // ALWAYS ignore the time/timezone part to ensure "Day 1" aligns with the calendar date
    const dateStr = eventStartDate.substring(0, 10); // Get just YYYY-MM-DD
    const parts = dateStr.split('-').map(Number);
    const eventYear = parts[0];
    const eventMonth = parts[1] - 1; // Month is 0-indexed
    const eventDay = parts[2];

    // Get match calendar date in local time
    const matchYear = matchDate.getFullYear();
    const matchMonth = matchDate.getMonth();
    const matchDay = matchDate.getDate();

    // Create new dates at midnight local time for comparison
    const matchMidnight = new Date(matchYear, matchMonth, matchDay);
    const eventMidnight = new Date(eventYear, eventMonth, eventDay);

    const diffTime = matchMidnight - eventMidnight;
    const dayIndex = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, dayIndex); // Ensure non-negative
};

/**
 * Check if a match should be grayed out
 */
export const shouldGrayOutMatch = (match, streams, streamStartTimes) => {
    // No start time = not yet played
    if (!match.started) {
        return {
            grayed: true,
            reason: "Match hasn't been played yet"
        };
    }

    const dayIndex = match.dayIndex;
    const stream = streams[dayIndex];

    // No stream for this day
    if (!stream || !stream.videoId) {
        return {
            grayed: true,
            reason: `No livestream provided for ${stream?.label || `Day ${dayIndex + 1}`}. Add a stream URL above.`
        };
    }

    // Stream exists but started late
    const streamStartTime = streamStartTimes[dayIndex];
    if (streamStartTime) {
        const matchTime = new Date(match.started).getTime();
        if (matchTime < streamStartTime) {
            const streamStartDate = new Date(streamStartTime);
            const timeStr = streamStartDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            return {
                grayed: true,
                reason: `Stream started at ${timeStr}. This match occurred before the stream began.`
            };
        }
    }

    return {
        grayed: false,
        reason: null
    };
};

/**
 * Enhance matches with day information and grayed out status
 */
/**
 * Enhance matches with stream information and grayed out status
 * Now uses smart time-based matching instead of strict day indices
 */
export const enhanceMatches = (matches, streams, streamStartTimes, eventStartDate) => {
    return matches.map(match => {
        const dayIndex = getMatchDayIndex(match.started, eventStartDate);

        // Find the best stream for this match
        // Logic: The stream must have started BEFORE the match
        // If multiple streams started before, pick the one that started most recently (closest to match)
        let assignedStreamIndex = -1;
        let bestStartTime = -1;
        let grayReason = null;
        let isGrayed = false;

        const matchTime = match.started ? new Date(match.started).getTime() : 0;

        if (!match.started) {
            isGrayed = true;
            grayReason = "Match hasn't been played yet";
        } else {
            // Check all active streams
            Object.entries(streamStartTimes).forEach(([indexStr, startTime]) => {
                const index = parseInt(indexStr);

                // Stream must have started before the match
                if (startTime < matchTime) {
                    // If this stream started closer to the match than our current best, pick it
                    if (startTime > bestStartTime) {
                        bestStartTime = startTime;
                        assignedStreamIndex = index;
                    }
                }
            });

            if (assignedStreamIndex === -1) {
                isGrayed = true;
                // Determine specific reason
                const hasStreams = Object.keys(streamStartTimes).length > 0;
                if (!hasStreams) {
                    grayReason = "No livestreams loaded. Add a stream URL above.";
                } else {
                    grayReason = "This match occurred before any of the loaded streams started.";
                }
            }
        }

        return {
            ...match,
            dayIndex, // Keep for grouping display
            assignedStreamIndex, // New: The actual stream to play
            grayedOut: isGrayed,
            grayReason
        };
    });
};

/**
 * Group matches by day
 */
export const groupMatchesByDay = (matches, dayLabels) => {
    const grouped = {};

    dayLabels.forEach((label, index) => {
        grouped[index] = {
            label,
            matches: []
        };
    });

    matches.forEach(match => {
        const dayIndex = match.dayIndex || 0;
        if (grouped[dayIndex]) {
            grouped[dayIndex].matches.push(match);
        }
    });

    return grouped;
};
