import { millisecondsInOneDay, millisecondsInOneHour } from '@cityssm/to-millis';
import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js';
import getCopiers from '../database/getCopiers.js';
const DEFAULT_COPIER_COUNT = 9;
const MAX_DAYS = 60;
const DURATION_PRESETS = [
    {
        days: 1,
        label: 'Past 24 Hours'
    },
    {
        days: 7,
        label: 'Past 7 Days'
    },
    {
        days: 30,
        label: 'Past 30 Days'
    },
    {
        days: 60,
        label: 'Past 60 Days'
    }
];
function getHourlyMaximumValues(hourlyCounts) {
    const maximumCountByHour = new Map();
    for (const hourlyCount of hourlyCounts) {
        const hourStartMillis = normalizeToHour(hourlyCount.timeMillis);
        const currentMaximumCount = maximumCountByHour.get(hourStartMillis);
        if (currentMaximumCount === undefined ||
            hourlyCount.countValue > currentMaximumCount) {
            maximumCountByHour.set(hourStartMillis, hourlyCount.countValue);
        }
    }
    return [...maximumCountByHour.entries()]
        .toSorted(([hourA], [hourB]) => hourA - hourB)
        .map(([timeMillis, countValue]) => ({ timeMillis, countValue }));
}
function normalizeToHour(timeMillis) {
    return Math.floor(timeMillis / millisecondsInOneHour) * millisecondsInOneHour;
}
function normalizeToLocalDay(timeMillis) {
    const date = new Date(timeMillis);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
const CANADIAN_HOLIDAY_DATES = [
    [2026, 0, 1],
    [2026, 1, 16],
    [2026, 3, 3],
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
function getCanadianHolidayDayStartMillis(startMillis, endMillis) {
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
function compareByMostPrints(copierA, copierB) {
    if (copierB.totalPrints !== copierA.totalPrints) {
        return copierB.totalPrints - copierA.totalPrints;
    }
    return copierA.copierName.localeCompare(copierB.copierName);
}
function getTotalPrints(hourlyCounts) {
    let previousCountValue;
    let totalPrints = 0;
    for (const hourlyCount of hourlyCounts) {
        if (previousCountValue !== undefined) {
            totalPrints += Math.max(0, hourlyCount.countValue - previousCountValue);
        }
        previousCountValue = hourlyCount.countValue;
    }
    return totalPrints;
}
export default function handler(_request, response) {
    const hourlyMaximums = getCopierHourlyMaximums();
    const activeCopiers = getCopiers();
    const copiersById = new Map();
    for (const copier of activeCopiers) {
        copiersById.set(copier.copierId, {
            copierId: copier.copierId,
            copierName: copier.copierName,
            hourlyCounts: [],
            totalPrints: 0
        });
    }
    for (const hourlyMaximum of hourlyMaximums) {
        const copierData = copiersById.get(hourlyMaximum.copierId);
        if (copierData !== undefined) {
            copierData.hourlyCounts.push({
                timeMillis: normalizeToHour(hourlyMaximum.hourStartMillis),
                countValue: hourlyMaximum.countValue
            });
        }
    }
    const copierData = [...copiersById.values()];
    for (const copier of copierData) {
        copier.hourlyCounts = getHourlyMaximumValues(copier.hourlyCounts);
        copier.totalPrints = getTotalPrints(copier.hourlyCounts);
    }
    const sortedByMostUsed = copierData.toSorted(compareByMostPrints);
    const nowMillis = Date.now();
    const durationOptions = DURATION_PRESETS.filter((durationPreset) => {
        if (durationPreset.days === 30 || durationPreset.days === 60) {
            return hourlyMaximums.some((hourlyMaximum) => hourlyMaximum.hourStartMillis <=
                nowMillis - durationPreset.days * millisecondsInOneDay);
        }
        return hourlyMaximums.some((hourlyMaximum) => hourlyMaximum.hourStartMillis >=
            nowMillis - durationPreset.days * millisecondsInOneDay);
    });
    const defaultDurationDays = durationOptions.some((o) => o.days === 7)
        ? 7
        : durationOptions.length > 0
            ? durationOptions[0].days
            : MAX_DAYS;
    const defaultDurationLabel = durationOptions.find((durationOption) => durationOption.days === defaultDurationDays)?.label ?? 'Past 60 Days';
    const defaultCopierIds = sortedByMostUsed
        .slice(0, DEFAULT_COPIER_COUNT)
        .map((copier) => copier.copierId);
    const holidayDayStartMillis = getCanadianHolidayDayStartMillis(nowMillis - MAX_DAYS * millisecondsInOneDay, nowMillis);
    const dashboardData = {
        copiers: sortedByMostUsed,
        defaultCopierIds,
        defaultDurationDays,
        durationOptions,
        holidayDayStartMillis
    };
    response.render('dashboard', {
        dashboardData,
        dashboardDataJson: JSON.stringify(dashboardData).replaceAll('</', String.raw `<\/`),
        durationLabel: defaultDurationLabel,
        headTitle: 'Office Copier Challenge'
    });
}
