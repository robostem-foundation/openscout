import { parse, format, isValid } from 'date-fns';

/**
 * Parse a date string as a calendar date in the local timezone.
 * This treats "2024-11-21" as Nov 21st in the user's local time,
 * preventing timezone shifts that occur when parsing as UTC.
 * 
 * @param {string} dateString - ISO date string (e.g., "2024-11-21" or "2024-11-21T00:00:00")
 * @returns {Date} Date object representing midnight local time on that date
 */
export const parseCalendarDate = (dateString) => {
    if (!dateString) return new Date();

    // Extract just the YYYY-MM-DD part
    const datePart = dateString.split('T')[0];

    // Create date components manually to avoid timezone issues
    const [year, month, day] = datePart.split('-').map(Number);

    // Create date at local midnight
    // Note: Month is 0-indexed in Date constructor
    return new Date(year, month - 1, day);
};

/**
 * Get a YYYY-MM-DD string from a Date object, using local time.
 * 
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getCalendarDateString = (date) => {
    if (!date || !isValid(date)) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * Format a date string for display (e.g., "Nov 21")
 * 
 * @param {string} dateString - ISO date string
 * @param {string} formatStr - Format string (default: 'MMM d')
 * @returns {string} Formatted date string
 */
export const formatEventDate = (dateString, formatStr = 'MMM d') => {
    if (!dateString) return '';

    const date = parseCalendarDate(dateString);
    return format(date, formatStr);
};
