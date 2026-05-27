import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js';
import getCopiers from '../database/getCopiers.js';
const DEFAULT_COPIER_COUNT = 9;
const HOUR_MILLIS = 60 * 60 * 1000;
const DAY_MILLIS = 24 * HOUR_MILLIS;
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
    return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS;
}
function normalizeToLocalDay(timeMillis) {
    const date = new Date(timeMillis);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function addLocalDays(date, dayCount) {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + dayCount);
    return newDate;
}
function getNthWeekdayOfMonth(year, month, weekday, occurrence) {
    const date = new Date(year, month, 1);
    while (date.getDay() !== weekday) {
        date.setDate(date.getDate() + 1);
    }
    date.setDate(date.getDate() + (occurrence - 1) * 7);
    return date;
}
function getLastWeekdayOfMonth(year, month, weekday) {
    const date = new Date(year, month + 1, 0);
    while (date.getDay() !== weekday) {
        date.setDate(date.getDate() - 1);
    }
    return date;
}
function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}
function getObservedHolidayDate(date) {
    if (date.getDay() === 6) {
        return addLocalDays(date, 2);
    }
    if (date.getDay() === 0) {
        return addLocalDays(date, 1);
    }
    return date;
}
const CANADIAN_HOLIDAYS = [
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 0, 1))
    },
    {
        getDate: (year) => getNthWeekdayOfMonth(year, 1, 1, 3)
    },
    {
        getDate: (year) => addLocalDays(getEasterSunday(year), -2)
    },
    {
        getDate: (year) => getLastWeekdayOfMonth(year, 4, 1)
    },
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 6, 1))
    },
    {
        getDate: (year) => getNthWeekdayOfMonth(year, 7, 1, 1)
    },
    {
        getDate: (year) => getNthWeekdayOfMonth(year, 8, 1, 1)
    },
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 8, 30))
    },
    {
        getDate: (year) => getNthWeekdayOfMonth(year, 9, 1, 2)
    },
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 10, 11))
    },
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 11, 25))
    },
    {
        getDate: (year) => getObservedHolidayDate(new Date(year, 11, 26))
    }
];
function getCanadianHolidayDayStartMillis(startMillis, endMillis) {
    if (endMillis <= startMillis) {
        return [];
    }
    const holidayDays = new Set();
    const startYear = new Date(startMillis).getFullYear();
    const endYear = new Date(endMillis).getFullYear();
    for (let year = startYear; year <= endYear; year += 1) {
        for (const holiday of CANADIAN_HOLIDAYS) {
            const holidayDayStartMillis = normalizeToLocalDay(holiday.getDate(year).getTime());
            if (holidayDayStartMillis >= startMillis &&
                holidayDayStartMillis < endMillis) {
                holidayDays.add(holidayDayStartMillis);
            }
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
                nowMillis - durationPreset.days * DAY_MILLIS);
        }
        return hourlyMaximums.some((hourlyMaximum) => hourlyMaximum.hourStartMillis >=
            nowMillis - durationPreset.days * DAY_MILLIS);
    });
    const defaultDurationDays = durationOptions.some((o) => o.days === 7)
        ? 7
        : durationOptions.length > 0
            ? durationOptions[0].days
            : MAX_DAYS;
    const defaultDurationLabel = durationOptions.find((durationOption) => durationOption.days === defaultDurationDays)
        ?.label ?? 'Past 60 Days';
    const defaultCopierIds = sortedByMostUsed
        .slice(0, DEFAULT_COPIER_COUNT)
        .map((copier) => copier.copierId);
    const holidayDayStartMillis = getCanadianHolidayDayStartMillis(nowMillis - MAX_DAYS * DAY_MILLIS, nowMillis);
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
