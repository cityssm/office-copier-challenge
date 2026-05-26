import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js';
import getCopiers from '../database/getCopiers.js';
import { getConfigProperty } from '../helpers/config.helpers.js';
const DEFAULT_COPIER_COUNT = 10;
function compareByMostPrints(copierA, copierB) {
    if (copierB.totalPrints !== copierA.totalPrints) {
        return copierB.totalPrints - copierA.totalPrints;
    }
    return copierA.copierName.localeCompare(copierB.copierName);
}
function compareByLeastPrints(copierA, copierB) {
    if (copierA.totalPrints !== copierB.totalPrints) {
        return copierA.totalPrints - copierB.totalPrints;
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
                timeMillis: hourlyMaximum.hourStartMillis,
                countValue: hourlyMaximum.countValue
            });
        }
    }
    const copierData = [...copiersById.values()];
    for (const copier of copierData) {
        copier.totalPrints = getTotalPrints(copier.hourlyCounts);
    }
    const sortedByMostUsed = copierData.toSorted(compareByMostPrints);
    const sortedByLeastUsed = copierData.toSorted(compareByLeastPrints);
    const defaultCopierIds = sortedByMostUsed
        .slice(0, DEFAULT_COPIER_COUNT)
        .map((copier) => copier.copierId);
    const mostUsedCopier = sortedByMostUsed.at(0);
    const leastUsedCopier = sortedByLeastUsed.at(0);
    const dashboardData = {
        copiers: copierData,
        defaultCopierIds,
        kpis: {
            mostUsedCopier: mostUsedCopier === undefined
                ? undefined
                : {
                    copierName: mostUsedCopier.copierName,
                    totalPrints: mostUsedCopier.totalPrints
                },
            leastUsedCopier: leastUsedCopier === undefined
                ? undefined
                : {
                    copierName: leastUsedCopier.copierName,
                    totalPrints: leastUsedCopier.totalPrints
                }
        }
    };
    response.render('dashboard', {
        dashboardData,
        dashboardDataJson: JSON.stringify(dashboardData).replaceAll('</', String.raw `<\/`),
        headTitle: getConfigProperty('application.applicationName')
    });
}
