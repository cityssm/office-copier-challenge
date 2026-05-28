import { millisecondsInOneHour } from "@cityssm/to-millis";
const CANADIAN_HOLIDAY_DATES = [
    [2026, 0, 1],
    [2026, 1, 16],
    [2026, 3, 3],
    [2026, 3, 6],
    [2026, 4, 18],
    [2026, 6, 1],
    [2026, 7, 3],
    [2026, 8, 7],
    [2026, 8, 30],
    [2026, 9, 12],
    [2026, 10, 11],
    [2026, 11, 25],
    [2026, 11, 28],
    [2027, 0, 1],
    [2027, 1, 15],
    [2027, 2, 26],
    [2027, 4, 24],
    [2027, 6, 1],
    [2027, 7, 2],
    [2027, 8, 6],
    [2027, 8, 30],
    [2027, 9, 11],
    [2027, 10, 11],
    [2027, 11, 27]
];
function normalizeToLocalDay(timeMillis) {
    const date = new Date(timeMillis);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
export function getCanadianHolidayDayStartMillis(startMillis, endMillis) {
    if (endMillis <= startMillis) {
        return [];
    }
    const holidayDays = new Set();
    for (const [year, month, day] of CANADIAN_HOLIDAY_DATES) {
        const holidayDayStartMillis = normalizeToLocalDay(new Date(year, month, day).getTime());
        if (holidayDayStartMillis >= startMillis &&
            holidayDayStartMillis < endMillis) {
            holidayDays.add(holidayDayStartMillis);
        }
    }
    return [...holidayDays].toSorted((dayA, dayB) => dayA - dayB);
}
export function normalizeToHour(timeMillis) {
    return Math.floor(timeMillis / millisecondsInOneHour) * millisecondsInOneHour;
}
