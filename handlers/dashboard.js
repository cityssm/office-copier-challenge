import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js';
import getCopiers from '../database/getCopiers.js';
import { getConfigProperty } from '../helpers/config.helpers.js';
const DEFAULT_COPIER_COUNT = 10;
const HOUR_MILLIS = 60 * 60 * 1000;
const DAY_MILLIS = 24 * HOUR_MILLIS;
const MAX_DAYS = 60;
function normalizeToHour(timeMillis) {
    return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS;
}
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
    // Calculate actual data duration
    let minHourStartMillis;
    for (const hourlyMaximum of hourlyMaximums) {
        if (minHourStartMillis === undefined ||
            hourlyMaximum.hourStartMillis < minHourStartMillis) {
            minHourStartMillis = hourlyMaximum.hourStartMillis;
        }
    }
    let durationLabel;
    if (minHourStartMillis === undefined) {
        durationLabel = `Last ${MAX_DAYS} Days`;
    }
    else {
        const daysOfHistory = Math.min(MAX_DAYS, Math.ceil((Date.now() - minHourStartMillis) / DAY_MILLIS));
        durationLabel = daysOfHistory <= 1 ? 'Last Day' : `Last ${daysOfHistory} Days`;
    }
    const defaultCopierIds = sortedByMostUsed
        .slice(0, DEFAULT_COPIER_COUNT)
        .map((copier) => copier.copierId);
    const dashboardData = {
        copiers: sortedByMostUsed,
        defaultCopierIds
    };
    response.render('dashboard', {
        dashboardData,
        dashboardDataJson: JSON.stringify(dashboardData).replaceAll('</', String.raw `<\/`),
        durationLabel,
        headTitle: getConfigProperty('application.applicationName')
    });
}
