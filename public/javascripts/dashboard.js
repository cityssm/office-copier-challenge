const HOUR_MILLIS = 60 * 60 * 1000;
const DAY_MILLIS = 24 * HOUR_MILLIS;
const DEFAULT_SELECTED_COPIER_COUNT = 9;
const SELECTED_COPIER_IDS_STORAGE_KEY = 'office-copier-challenge.selectedCopierIds';
const LOW_PRINT_THRESHOLD = 5;
const DOUBLE_SIDED_PRINT_SHARE = 0.5;
const PAGES_PER_REAM = 500;
const REAMS_PER_CARTON = 10;
const TREES_PER_CARTON = 0.6;
const COPIER_BAND_CLASSES = [
    'has-background-danger-light',
    'has-background-warning-light',
    'has-background-success-light'
];
const COPIER_ICON_CLASSES = [
    'has-text-danger',
    'has-text-warning',
    'has-text-success'
];
const COPIER_TIER_LABELS = ['High usage', 'Medium usage', 'Low usage'];
function normalizeToHour(timeMillis) {
    return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS;
}
function normalizeToDay(timeMillis) {
    return Math.floor(timeMillis / DAY_MILLIS) * DAY_MILLIS;
}
function normalizeToLocalDay(timeMillis) {
    const date = new Date(timeMillis);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function addLocalDay(timeMillis) {
    const date = new Date(timeMillis);
    date.setDate(date.getDate() + 1);
    return date.getTime();
}
function buildHourlyDeltaSeries(hourlyCounts) {
    const maximumCountByHour = new Map();
    for (const hourlyCount of hourlyCounts) {
        const hourStartMillis = normalizeToHour(hourlyCount.timeMillis);
        const currentMaximumCount = maximumCountByHour.get(hourStartMillis);
        if (currentMaximumCount === undefined ||
            hourlyCount.countValue > currentMaximumCount) {
            maximumCountByHour.set(hourStartMillis, hourlyCount.countValue);
        }
    }
    const sortedHourlyMaximums = [...maximumCountByHour.entries()].toSorted(([hourA], [hourB]) => hourA - hourB);
    const deltaSeries = [];
    let previousCountValue;
    for (const [timeMillis, countValue] of sortedHourlyMaximums) {
        if (previousCountValue !== undefined) {
            deltaSeries.push([
                timeMillis,
                Math.max(0, countValue - previousCountValue)
            ]);
        }
        previousCountValue = countValue;
    }
    return deltaSeries;
}
function buildDailyDeltaSeries(hourlyCounts) {
    const hourlyDeltas = buildHourlyDeltaSeries(hourlyCounts);
    const dailyPrints = new Map();
    for (const [timeMillis, prints] of hourlyDeltas) {
        const dayStartMillis = normalizeToDay(timeMillis);
        dailyPrints.set(dayStartMillis, (dailyPrints.get(dayStartMillis) ?? 0) + prints);
    }
    return [...dailyPrints.entries()].toSorted(([dayA], [dayB]) => dayA - dayB);
}
function formatHourAmPm(date) {
    const hours = date.getHours();
    const ampm = hours < 12 ? 'am' : 'pm';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12} ${ampm}`;
}
function formatTooltipDateTime(date) {
    return `${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })} ${formatHourAmPm(date)}`;
}
function formatEstimate(value) {
    return value.toLocaleString();
}
function formatFractionalEstimate(value) {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: 2
    });
}
function calculateEstimatedPaperImpact(totalPrints) {
    const estimatedPages = Math.round(totalPrints * (1 - DOUBLE_SIDED_PRINT_SHARE + DOUBLE_SIDED_PRINT_SHARE / 2));
    const estimatedReams = estimatedPages / PAGES_PER_REAM;
    const estimatedCartons = estimatedReams / REAMS_PER_CARTON;
    const estimatedTrees = estimatedCartons * TREES_PER_CARTON;
    return {
        estimatedPages,
        estimatedReams,
        estimatedCartons,
        estimatedTrees
    };
}
function clampRange(rangeStartMillis, rangeEndMillis, minMillis, maxMillis) {
    const clampedStartMillis = Math.max(rangeStartMillis, minMillis);
    const clampedEndMillis = Math.min(rangeEndMillis, maxMillis);
    return clampedStartMillis < clampedEndMillis
        ? [clampedStartMillis, clampedEndMillis]
        : undefined;
}
function buildShadedTimeRanges(startMillis, endMillis, useDailyCounts, holidayDayStartMillis) {
    if (endMillis <= startMillis) {
        return [];
    }
    const shadedRanges = [];
    const holidayDayStartSet = new Set(holidayDayStartMillis);
    for (let dayStartMillis = normalizeToLocalDay(startMillis); dayStartMillis < endMillis; dayStartMillis = addLocalDay(dayStartMillis)) {
        const dayEndMillis = addLocalDay(dayStartMillis);
        const dayOfWeek = new Date(dayStartMillis).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidayDayStartSet.has(dayStartMillis);
        if (isWeekend || isHoliday) {
            const weekendRange = clampRange(dayStartMillis, dayEndMillis, startMillis, endMillis);
            if (weekendRange !== undefined) {
                shadedRanges.push([
                    { xAxis: weekendRange[0] },
                    { xAxis: weekendRange[1] }
                ]);
            }
            continue;
        }
        if (useDailyCounts) {
            continue;
        }
        const morningRange = clampRange(dayStartMillis, dayStartMillis + 7 * HOUR_MILLIS, startMillis, endMillis);
        if (morningRange !== undefined) {
            shadedRanges.push([
                { xAxis: morningRange[0] },
                { xAxis: morningRange[1] }
            ]);
        }
        const eveningRange = clampRange(dayStartMillis + 17 * HOUR_MILLIS, dayEndMillis, startMillis, endMillis);
        if (eveningRange !== undefined) {
            shadedRanges.push([
                { xAxis: eveningRange[0] },
                { xAxis: eveningRange[1] }
            ]);
        }
    }
    return shadedRanges;
}
function computeKpisForRange(copiers, cutoffMillis) {
    const totalPrintsByCopierName = new Map(copiers.map((copier) => [copier.copierName, copier.totalPrints]));
    function getWinningCopierNames(copierNames, useHighestTotals) {
        const uniqueCopierNames = [...new Set(copierNames)];
        if (uniqueCopierNames.length <= 1) {
            return uniqueCopierNames;
        }
        let targetTotalPrints;
        for (const copierName of uniqueCopierNames) {
            const totalPrints = totalPrintsByCopierName.get(copierName) ?? 0;
            if (targetTotalPrints === undefined ||
                (useHighestTotals
                    ? totalPrints > targetTotalPrints
                    : totalPrints < targetTotalPrints)) {
                targetTotalPrints = totalPrints;
            }
        }
        return uniqueCopierNames
            .filter((copierName) => (totalPrintsByCopierName.get(copierName) ?? 0) === targetTotalPrints)
            .toSorted((nameA, nameB) => nameA.localeCompare(nameB));
    }
    const copierHourlyDeltas = copiers.map((copier) => ({
        copier,
        hourlyDeltas: buildHourlyDeltaSeries(copier.hourlyCounts).filter(([timeMillis]) => timeMillis >= cutoffMillis)
    }));
    const allHoursSet = new Set();
    const copierHourMaps = copierHourlyDeltas.map(({ copier, hourlyDeltas }) => {
        const hourMap = new Map();
        for (const [timeMillis, prints] of hourlyDeltas) {
            hourMap.set(timeMillis, prints);
            allHoursSet.add(timeMillis);
        }
        return { copier, hourMap, hourlyDeltas };
    });
    const allHours = [...allHoursSet].toSorted((a, b) => a - b);
    let busiestHourTime;
    let busiestHourTotal = 0;
    for (const timeMillis of allHours) {
        let total = 0;
        for (const { hourMap } of copierHourMaps) {
            total += hourMap.get(timeMillis) ?? 0;
        }
        if (total > busiestHourTotal) {
            busiestHourTotal = total;
            busiestHourTime = timeMillis;
        }
    }
    let busiestCopierHour;
    const busiestCopierHourCandidates = [];
    let busiestCopierPrints = -1;
    for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
        for (const [timeMillis, prints] of hourlyDeltas) {
            if (prints > busiestCopierPrints) {
                busiestCopierPrints = prints;
                busiestCopierHourCandidates.length = 0;
                busiestCopierHourCandidates.push({
                    copierName: copier.copierName,
                    timeMillis
                });
            }
            else if (prints === busiestCopierPrints) {
                busiestCopierHourCandidates.push({
                    copierName: copier.copierName,
                    timeMillis
                });
            }
        }
    }
    if (busiestCopierHourCandidates.length > 0) {
        const winningCopierNames = new Set(getWinningCopierNames(busiestCopierHourCandidates.map((candidate) => candidate.copierName), true));
        const busiestTimeByCopierName = new Map();
        for (const candidate of busiestCopierHourCandidates) {
            if (!winningCopierNames.has(candidate.copierName)) {
                continue;
            }
            const existingTimeMillis = busiestTimeByCopierName.get(candidate.copierName);
            if (existingTimeMillis === undefined ||
                candidate.timeMillis < existingTimeMillis) {
                busiestTimeByCopierName.set(candidate.copierName, candidate.timeMillis);
            }
        }
        busiestCopierHour = {
            copierHours: [...busiestTimeByCopierName.entries()]
                .map(([copierName, timeMillis]) => ({ copierName, timeMillis }))
                .toSorted((copierA, copierB) => copierA.copierName.localeCompare(copierB.copierName)),
            prints: busiestCopierPrints
        };
    }
    const hourTopCopierNames = new Map();
    for (const timeMillis of allHours) {
        let topPrints = 0;
        const topCopierNames = [];
        for (const { copier, hourMap } of copierHourMaps) {
            const prints = hourMap.get(timeMillis) ?? 0;
            if (prints > topPrints) {
                topPrints = prints;
                topCopierNames.length = 0;
                topCopierNames.push(copier.copierName);
            }
            else if (prints === topPrints && prints > 0) {
                topCopierNames.push(copier.copierName);
            }
        }
        if (topCopierNames.length > 0) {
            hourTopCopierNames.set(timeMillis, topCopierNames);
        }
    }
    const longestTopRunByCopierName = new Map();
    const longestTopRunRangeByCopierName = new Map();
    for (const { copier } of copierHourlyDeltas) {
        let currentRun = 0;
        let previousWasTop = false;
        let longestRun = 0;
        let currentRunStartMillis;
        for (let index = 0; index < allHours.length; index += 1) {
            const timeMillis = allHours[index];
            const topCopierNames = hourTopCopierNames.get(timeMillis) ?? [];
            const isTopCopier = topCopierNames.includes(copier.copierName);
            const isConsecutive = index > 0 && allHours[index] - allHours[index - 1] === HOUR_MILLIS;
            if (isTopCopier) {
                if (isConsecutive && previousWasTop) {
                    currentRun += 1;
                }
                else {
                    currentRun = 1;
                    currentRunStartMillis = timeMillis;
                }
            }
            else {
                currentRun = 0;
                currentRunStartMillis = undefined;
            }
            previousWasTop = isTopCopier;
            if (currentRun > longestRun && currentRunStartMillis !== undefined) {
                longestRun = currentRun;
                longestTopRunRangeByCopierName.set(copier.copierName, [
                    currentRunStartMillis,
                    timeMillis
                ]);
            }
        }
        longestTopRunByCopierName.set(copier.copierName, longestRun);
    }
    const longestTopRun = Math.max(...longestTopRunByCopierName.values(), 0);
    const longestTopCopierNames = longestTopRun > 0
        ? getWinningCopierNames([...longestTopRunByCopierName.entries()]
            .filter(([, run]) => run === longestTopRun)
            .map(([copierName]) => copierName), true)
        : [];
    const longestTopCopierStats = longestTopCopierNames.flatMap((copierName) => {
        const longestRunRange = longestTopRunRangeByCopierName.get(copierName);
        if (longestRunRange === undefined) {
            return [];
        }
        return [
            {
                copierName,
                startTimeMillis: longestRunRange[0],
                endTimeMillis: longestRunRange[1]
            }
        ];
    });
    const longestActiveRunByCopierName = new Map();
    const longestActiveRunRangeByCopierName = new Map();
    for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
        let currentRun = 0;
        let longestRun = 0;
        let currentRunStartMillis;
        for (let index = 0; index < hourlyDeltas.length; index += 1) {
            const [timeMillis, prints] = hourlyDeltas[index];
            const isConsecutive = index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS;
            if (prints > 0) {
                if (isConsecutive && currentRun > 0) {
                    currentRun += 1;
                }
                else {
                    currentRun = 1;
                    currentRunStartMillis = timeMillis;
                }
            }
            else {
                currentRun = 0;
                currentRunStartMillis = undefined;
            }
            if (currentRun > longestRun && currentRunStartMillis !== undefined) {
                longestRun = currentRun;
                longestActiveRunRangeByCopierName.set(copier.copierName, [
                    currentRunStartMillis,
                    timeMillis
                ]);
            }
        }
        longestActiveRunByCopierName.set(copier.copierName, longestRun);
    }
    const longestActiveRun = Math.max(...longestActiveRunByCopierName.values(), 0);
    const longestActiveCopierNames = longestActiveRun > 0
        ? getWinningCopierNames([...longestActiveRunByCopierName.entries()]
            .filter(([, run]) => run === longestActiveRun)
            .map(([copierName]) => copierName), true)
        : [];
    const longestActiveCopierStats = longestActiveCopierNames.flatMap((copierName) => {
        const longestRunRange = longestActiveRunRangeByCopierName.get(copierName);
        if (longestRunRange === undefined) {
            return [];
        }
        return [
            {
                copierName,
                startTimeMillis: longestRunRange[0],
                endTimeMillis: longestRunRange[1]
            }
        ];
    });
    const longestLowRunByCopierName = new Map();
    const longestLowRunRangeByCopierName = new Map();
    const longestLowRunPrintsByCopierName = new Map();
    const lowPrintHoursByCopierName = new Map();
    for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
        let currentRun = 0;
        let currentRunPrints = 0;
        let longestRun = 0;
        let longestRunPrints;
        let currentRunStartMillis;
        let lowPrintHours = 0;
        for (let index = 0; index < hourlyDeltas.length; index += 1) {
            const [timeMillis, prints] = hourlyDeltas[index];
            const isConsecutive = index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS;
            if (prints < LOW_PRINT_THRESHOLD) {
                lowPrintHours += 1;
                if (isConsecutive && currentRun > 0) {
                    currentRun += 1;
                    currentRunPrints += prints;
                }
                else {
                    currentRun = 1;
                    currentRunPrints = prints;
                    currentRunStartMillis = timeMillis;
                }
            }
            else {
                currentRun = 0;
                currentRunPrints = 0;
                currentRunStartMillis = undefined;
            }
            if (currentRun > longestRun && currentRunStartMillis !== undefined) {
                longestRun = currentRun;
                longestRunPrints = currentRunPrints;
                longestLowRunRangeByCopierName.set(copier.copierName, [
                    currentRunStartMillis,
                    timeMillis
                ]);
            }
            else if (currentRun === longestRun &&
                currentRun > 0 &&
                (longestRunPrints === undefined ||
                    currentRunPrints < longestRunPrints) &&
                currentRunStartMillis !== undefined) {
                longestRunPrints = currentRunPrints;
                longestLowRunRangeByCopierName.set(copier.copierName, [
                    currentRunStartMillis,
                    timeMillis
                ]);
            }
        }
        longestLowRunByCopierName.set(copier.copierName, longestRun);
        longestLowRunPrintsByCopierName.set(copier.copierName, longestRunPrints ?? 0);
        lowPrintHoursByCopierName.set(copier.copierName, lowPrintHours);
    }
    const longestLowRun = Math.max(...longestLowRunByCopierName.values(), 0);
    const longestLowCopierNames = longestLowRun > 0
        ? getWinningCopierNames([...longestLowRunByCopierName.entries()]
            .filter(([, run]) => run === longestLowRun)
            .map(([copierName]) => copierName), false)
        : [];
    const longestLowCopierStats = longestLowCopierNames.flatMap((copierName) => {
        const longestRunRange = longestLowRunRangeByCopierName.get(copierName);
        if (longestRunRange === undefined) {
            return [];
        }
        return [
            {
                copierName,
                prints: longestLowRunPrintsByCopierName.get(copierName) ?? 0,
                startTimeMillis: longestRunRange[0],
                endTimeMillis: longestRunRange[1]
            }
        ];
    });
    const mostLowPrintHours = Math.max(...lowPrintHoursByCopierName.values(), 0);
    const mostLowPrintHourCopierNames = mostLowPrintHours > 0
        ?
            [...lowPrintHoursByCopierName.entries()]
                .filter(([, hourCount]) => hourCount === mostLowPrintHours)
                .map(([copierName]) => copierName)
                .toSorted((nameA, nameB) => nameA.localeCompare(nameB))
        : [];
    return {
        busiestHour: busiestHourTime === undefined
            ? undefined
            : { timeMillis: busiestHourTime, totalPrints: busiestHourTotal },
        busiestCopierHour,
        mostConsecutiveTopCopier: longestTopCopierStats.length > 0 && longestTopRun > 1
            ? { copierStats: longestTopCopierStats, hours: longestTopRun }
            : undefined,
        mostConsecutiveActiveHours: longestActiveCopierStats.length > 0 && longestActiveRun > 1
            ? { copierStats: longestActiveCopierStats, hours: longestActiveRun }
            : undefined,
        mostConsecutiveLowPrint: longestLowCopierStats.length > 0 && longestLowRun > 1
            ? { copierStats: longestLowCopierStats, hours: longestLowRun }
            : undefined,
        mostHoursLowPrintOverall: mostLowPrintHourCopierNames.length > 0
            ? { copierNames: mostLowPrintHourCopierNames, hours: mostLowPrintHours }
            : undefined
    };
}
;
(() => {
    const dashboardDataElement = document.querySelector('#dashboardData');
    if (!(dashboardDataElement instanceof HTMLScriptElement)) {
        return;
    }
    const chartContainerElement = document.querySelector('#copierUsageChart');
    if (!(chartContainerElement instanceof HTMLDivElement)) {
        return;
    }
    const chartDurationDaysElement = document.querySelector('#chartDurationDays');
    if (!(chartDurationDaysElement instanceof HTMLSelectElement)) {
        return;
    }
    const toggleHiddenCopiersElement = document.querySelector('#toggleHiddenCopiers');
    if (!(toggleHiddenCopiersElement instanceof HTMLButtonElement)) {
        return;
    }
    const toggleStackedChartElement = document.querySelector('#toggleStackedChart');
    if (!(toggleStackedChartElement instanceof HTMLButtonElement)) {
        return;
    }
    const selectAllCopiersElement = document.querySelector('#selectAllCopiers');
    const deselectAllCopiersElement = document.querySelector('#deselectAllCopiers');
    const resetCopierSelectionElement = document.querySelector('#resetCopierSelection');
    if (!(selectAllCopiersElement instanceof HTMLButtonElement) ||
        !(deselectAllCopiersElement instanceof HTMLButtonElement) ||
        !(resetCopierSelectionElement instanceof HTMLButtonElement)) {
        return;
    }
    const dashboardData = JSON.parse(dashboardDataElement.text);
    const copierDataById = new Map();
    for (const copierData of dashboardData.copiers) {
        copierDataById.set(copierData.copierId, copierData);
    }
    const chart = echarts.init(chartContainerElement);
    const updateChart = () => {
        const selectedDurationDays = Number(chartDurationDaysElement.value);
        const nowMillis = Date.now();
        const cutoffMillis = nowMillis -
            (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) *
                DAY_MILLIS;
        const useDailyCounts = selectedDurationDays === 30 || selectedDurationDays === 60;
        const shadedTimeRanges = buildShadedTimeRanges(cutoffMillis, nowMillis, useDailyCounts, dashboardData.holidayDayStartMillis);
        const selectedCopierIds = [
            ...document.querySelectorAll('.js-copier-checkbox:checked')
        ].map((checkboxElement) => Number(checkboxElement.value));
        const selectedCopiers = selectedCopierIds
            .map((copierId) => copierDataById.get(copierId))
            .filter((copier) => copier !== undefined);
        chart.clear();
        const series = selectedCopiers.map((copier) => ({
            name: copier.copierName,
            type: 'line',
            showSymbol: false,
            ...(isStackedChart ? { stack: 'total', areaStyle: {} } : {}),
            data: useDailyCounts
                ? buildDailyDeltaSeries(copier.hourlyCounts).filter(([timeMillis]) => timeMillis >= cutoffMillis)
                : buildHourlyDeltaSeries(copier.hourlyCounts).filter(([timeMillis]) => timeMillis >= cutoffMillis)
        }));
        if (series.length > 0 && shadedTimeRanges.length > 0) {
            series[0] = {
                ...series[0],
                markArea: {
                    silent: true,
                    tooltip: {
                        show: false
                    },
                    itemStyle: {
                        color: 'rgba(128, 128, 128, 0.18)'
                    },
                    data: shadedTimeRanges
                }
            };
        }
        chart.setOption({
            animation: false,
            tooltip: {
                trigger: 'axis',
                formatter: (tooltipItems) => {
                    if (tooltipItems.length === 0) {
                        return '';
                    }
                    const printCountBySeries = tooltipItems.map((point) => ({
                        ...point,
                        printCount: point.value[1]
                    }));
                    const totalPrintCount = printCountBySeries.reduce((total, point) => total + point.printCount, 0);
                    const topSeriesPrintCount = printCountBySeries.reduce((topPrintCount, point) => Math.max(topPrintCount, point.printCount), Number.NEGATIVE_INFINITY);
                    const totalPrintLabel = totalPrintCount === 1 ? 'print' : 'prints';
                    const timeHeader = useDailyCounts
                        ? new Date(tooltipItems[0].axisValue).toLocaleDateString()
                        : formatTooltipDateTime(new Date(tooltipItems[0].axisValue));
                    return [
                        `${timeHeader} · Total: ${totalPrintCount.toLocaleString()} ${totalPrintLabel}`,
                        ...printCountBySeries.map((point) => {
                            const pointLine = `${point.marker} ${point.seriesName}: ${point.printCount.toLocaleString()}`;
                            return topSeriesPrintCount > 0 &&
                                point.printCount === topSeriesPrintCount
                                ? `<strong>${pointLine}</strong>`
                                : pointLine;
                        })
                    ].join('<br/>');
                }
            },
            legend: {
                type: 'scroll',
                selectedMode: false
            },
            xAxis: {
                type: 'time',
                axisLabel: useDailyCounts
                    ? {}
                    : {
                        formatter: (value) => formatHourAmPm(new Date(value))
                    }
            },
            yAxis: {
                type: 'value',
                name: useDailyCounts ? 'Daily Prints' : 'Hourly Prints'
            },
            series
        });
    };
    const checkboxElements = document.querySelectorAll('.js-copier-checkbox');
    const copierSelectionElement = document.querySelector('#copierSelection');
    const copierFilterElement = document.querySelector('#copierNameFilter');
    const copierOptionElements = document.querySelectorAll('.js-copier-option');
    let showHiddenCopiers = false;
    let isStackedChart = false;
    let copierNameFilterText = '';
    const getDurationRange = () => {
        const selectedDurationDays = Number(chartDurationDaysElement.value);
        const nowMillis = Date.now();
        return {
            cutoffMillis: nowMillis -
                (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) *
                    DAY_MILLIS
        };
    };
    const getPrintCountByCopier = (cutoffMillis) => dashboardData.copiers.map((copier) => ({
        copierId: copier.copierId,
        copierName: copier.copierName,
        printCount: getPrintCountInRange(copier, cutoffMillis)
    }));
    const getDefaultSelectedCopierIds = () => {
        const { cutoffMillis } = getDurationRange();
        return new Set(getPrintCountByCopier(cutoffMillis)
            .toSorted((copierA, copierB) => {
            if (copierB.printCount !== copierA.printCount) {
                return copierB.printCount - copierA.printCount;
            }
            return copierA.copierName.localeCompare(copierB.copierName);
        })
            .slice(0, DEFAULT_SELECTED_COPIER_COUNT)
            .map((copier) => copier.copierId));
    };
    const getSelectedCopierIds = () => new Set([
        ...document.querySelectorAll('.js-copier-checkbox:checked')
    ].map((checkboxElement) => Number(checkboxElement.value)));
    const applySelectedCopierIds = (selectedCopierIds) => {
        for (const checkboxElement of checkboxElements) {
            checkboxElement.checked = selectedCopierIds.has(Number(checkboxElement.value));
        }
    };
    const loadSelectedCopierIds = () => {
        try {
            const storedValue = globalThis.localStorage.getItem(SELECTED_COPIER_IDS_STORAGE_KEY);
            if (storedValue === null || storedValue === '') {
                return;
            }
            const storedCopierIds = JSON.parse(storedValue);
            if (!Array.isArray(storedCopierIds)) {
                return;
            }
            const selectedCopierIds = storedCopierIds
                .map((value) => Number(value))
                .filter((copierId) => Number.isInteger(copierId) && copierDataById.has(copierId));
            return new Set(selectedCopierIds);
        }
        catch {
            return;
        }
    };
    const storeSelectedCopierIds = () => {
        try {
            globalThis.localStorage.setItem(SELECTED_COPIER_IDS_STORAGE_KEY, JSON.stringify([...getSelectedCopierIds()]));
        }
        catch {
        }
    };
    const updateKpis = () => {
        const kpiSectionElement = document.querySelector('#kpiSection');
        if (!(kpiSectionElement instanceof HTMLElement)) {
            return;
        }
        const { cutoffMillis } = getDurationRange();
        const kpis = computeKpisForRange(dashboardData.copiers, cutoffMillis);
        const selectedDurationDays = Number(chartDurationDaysElement.value);
        const durationLabel = dashboardData.durationOptions.find((option) => option.days === selectedDurationDays)?.label ?? '';
        const setKpi = (idBase, value, context) => {
            const valueElement = document.querySelector(`#${idBase}Value`);
            const contextElement = document.querySelector(`#${idBase}Context`);
            if (valueElement instanceof HTMLElement) {
                valueElement.textContent = value;
            }
            if (contextElement instanceof HTMLElement) {
                contextElement.textContent = context;
            }
        };
        const noDataValue = '—';
        const noDataContext = 'No data available';
        const formatCopierNames = (copierNames) => copierNames.join('\n');
        const formatConsecutiveHoursCopierStats = (copierStats) => copierStats
            .map((copierStat) => `${copierStat.copierName}\n${formatTooltipDateTime(new Date(copierStat.startTimeMillis))} to ${formatTooltipDateTime(new Date(copierStat.endTimeMillis))}`)
            .join('\n');
        const formatPrintCount = (prints) => `${prints.toLocaleString()} prints`;
        const formatHourCount = (hours) => `${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`;
        if (kpis.busiestHour === undefined) {
            setKpi('kpiBusiestHour', noDataValue, noDataContext);
        }
        else {
            setKpi('kpiBusiestHour', formatPrintCount(kpis.busiestHour.totalPrints), formatTooltipDateTime(new Date(kpis.busiestHour.timeMillis)));
        }
        if (kpis.busiestCopierHour === undefined) {
            setKpi('kpiBusiestCopierHour', noDataValue, noDataContext);
        }
        else {
            const firstCopierHour = kpis.busiestCopierHour.copierHours[0];
            if (firstCopierHour === undefined) {
                setKpi('kpiBusiestCopierHour', noDataValue, noDataContext);
            }
            else {
                setKpi('kpiBusiestCopierHour', formatPrintCount(kpis.busiestCopierHour.prints), kpis.busiestCopierHour.copierHours
                    .map((copierHour) => `${copierHour.copierName}\n${formatTooltipDateTime(new Date(copierHour.timeMillis))}`)
                    .join('\n'));
            }
        }
        if (kpis.mostConsecutiveTopCopier === undefined) {
            setKpi('kpiTopCopierStreak', noDataValue, noDataContext);
        }
        else {
            setKpi('kpiTopCopierStreak', formatHourCount(kpis.mostConsecutiveTopCopier.hours), formatConsecutiveHoursCopierStats(kpis.mostConsecutiveTopCopier.copierStats));
        }
        if (kpis.mostConsecutiveActiveHours === undefined) {
            setKpi('kpiActiveStreak', noDataValue, noDataContext);
        }
        else {
            setKpi('kpiActiveStreak', formatHourCount(kpis.mostConsecutiveActiveHours.hours), formatConsecutiveHoursCopierStats(kpis.mostConsecutiveActiveHours.copierStats));
        }
        if (kpis.mostConsecutiveLowPrint === undefined) {
            setKpi('kpiLowPrintStreak', noDataValue, noDataContext);
        }
        else {
            setKpi('kpiLowPrintStreak', formatHourCount(kpis.mostConsecutiveLowPrint.hours), formatConsecutiveHoursCopierStats(kpis.mostConsecutiveLowPrint.copierStats));
        }
        if (kpis.mostHoursLowPrintOverall === undefined) {
            setKpi('kpiLowPrintHours', noDataValue, noDataContext);
        }
        else {
            setKpi('kpiLowPrintHours', formatHourCount(kpis.mostHoursLowPrintOverall.hours), formatCopierNames(kpis.mostHoursLowPrintOverall.copierNames));
        }
        const totalPrints = dashboardData.copiers.reduce((total, copier) => total + getPrintCountInRange(copier, cutoffMillis), 0);
        setKpi('kpiTotalPrints', formatPrintCount(totalPrints), durationLabel);
        const totalPrintsImpact = calculateEstimatedPaperImpact(totalPrints);
        const estimatedPagesElement = document.querySelector('#kpiEstimatedPagesValue');
        const estimatedReamsElement = document.querySelector('#kpiEstimatedReamsValue');
        const estimatedCartonsElement = document.querySelector('#kpiEstimatedCartonsValue');
        const estimatedTreesElement = document.querySelector('#kpiEstimatedTreesValue');
        if (estimatedPagesElement instanceof HTMLElement) {
            estimatedPagesElement.textContent = formatEstimate(totalPrintsImpact.estimatedPages);
        }
        if (estimatedReamsElement instanceof HTMLElement) {
            estimatedReamsElement.textContent = formatFractionalEstimate(totalPrintsImpact.estimatedReams);
        }
        if (estimatedCartonsElement instanceof HTMLElement) {
            estimatedCartonsElement.textContent = formatFractionalEstimate(totalPrintsImpact.estimatedCartons);
        }
        if (estimatedTreesElement instanceof HTMLElement) {
            estimatedTreesElement.textContent = formatFractionalEstimate(totalPrintsImpact.estimatedTrees);
        }
    };
    const getPrintCountInRange = (copier, cutoffMillis) => buildHourlyDeltaSeries(copier.hourlyCounts)
        .filter(([timeMillis]) => timeMillis >= cutoffMillis)
        .reduce((total, [, printCount]) => total + printCount, 0);
    const getCopierTierIndex = (copierIndex, copierCount) => {
        const baseBandSize = Math.floor(copierCount / 3);
        const remainderCount = copierCount % 3;
        const topBandSize = baseBandSize + (remainderCount >= 1 ? 1 : 0);
        const middleBandSize = baseBandSize + (remainderCount >= 2 ? 1 : 0);
        if (copierIndex < topBandSize) {
            return 0;
        }
        if (copierIndex < topBandSize + middleBandSize) {
            return 1;
        }
        return 2;
    };
    const updateCopierOptionTier = (copierOptionElement, copierIndex, copierCount) => {
        const tierIndex = getCopierTierIndex(copierIndex, copierCount);
        const tierLabel = COPIER_TIER_LABELS[tierIndex];
        const labelElement = copierOptionElement.querySelector('label');
        if (labelElement instanceof HTMLLabelElement) {
            labelElement.classList.remove(...COPIER_BAND_CLASSES);
            labelElement.classList.add(COPIER_BAND_CLASSES[tierIndex]);
        }
        const tierIconElement = copierOptionElement.querySelector('.icon');
        if (tierIconElement instanceof HTMLSpanElement) {
            tierIconElement.setAttribute('title', tierLabel);
        }
        const tierLayersElement = copierOptionElement.querySelector('.fa-layers');
        if (tierLayersElement instanceof HTMLSpanElement) {
            tierLayersElement.classList.remove(...COPIER_ICON_CLASSES);
            tierLayersElement.classList.add(COPIER_ICON_CLASSES[tierIndex]);
        }
        const tierLabelElement = copierOptionElement.querySelector('.is-sr-only');
        if (tierLabelElement instanceof HTMLSpanElement) {
            tierLabelElement.textContent = tierLabel;
        }
    };
    const reorderCopierOptionsForDuration = (copierCounts) => {
        if (!(copierSelectionElement instanceof HTMLDivElement)) {
            return;
        }
        const sortedCopierCounts = copierCounts.toSorted((copierA, copierB) => {
            if (copierB.printCount !== copierA.printCount) {
                return copierB.printCount - copierA.printCount;
            }
            return copierA.copierName.localeCompare(copierB.copierName);
        });
        const sortedCopierIds = sortedCopierCounts.map((copierCount) => copierCount.copierId);
        const currentCopierIds = [
            ...copierSelectionElement.querySelectorAll('.js-copier-checkbox')
        ].map((checkboxElement) => Number(checkboxElement.value));
        const orderMatches = currentCopierIds.length === sortedCopierIds.length &&
            currentCopierIds.every((copierId, copierIndex) => copierId === sortedCopierIds[copierIndex]);
        if (orderMatches) {
            return;
        }
        const copierOptionById = new Map();
        for (const copierOptionElement of copierOptionElements) {
            const checkboxElement = copierOptionElement.querySelector('.js-copier-checkbox');
            if (checkboxElement instanceof HTMLInputElement) {
                copierOptionById.set(Number(checkboxElement.value), copierOptionElement);
            }
        }
        for (let copierIndex = 0; copierIndex < sortedCopierCounts.length; copierIndex += 1) {
            const copierOptionElement = copierOptionById.get(sortedCopierCounts[copierIndex].copierId);
            if (copierOptionElement === undefined) {
                continue;
            }
            copierSelectionElement.append(copierOptionElement);
            updateCopierOptionTier(copierOptionElement, copierIndex, sortedCopierCounts.length);
        }
    };
    const updateCopierCountsForDuration = () => {
        const { cutoffMillis } = getDurationRange();
        const copierCounts = getPrintCountByCopier(cutoffMillis);
        for (const copierCount of copierCounts) {
            const checkboxElement = document.querySelector(`.js-copier-checkbox[value="${copierCount.copierId}"]`);
            const countElement = checkboxElement
                ?.closest('.js-copier-option')
                ?.querySelector('.js-copier-count');
            if (countElement instanceof HTMLSpanElement) {
                countElement.textContent = copierCount.printCount.toLocaleString();
            }
        }
        reorderCopierOptionsForDuration(copierCounts);
    };
    const updateHiddenCopiersButton = () => {
        toggleHiddenCopiersElement.textContent = showHiddenCopiers
            ? 'Hide hidden copiers'
            : 'Show hidden copiers';
        toggleHiddenCopiersElement.setAttribute('aria-pressed', showHiddenCopiers ? 'true' : 'false');
    };
    const updateStackedChartButton = () => {
        toggleStackedChartElement.setAttribute('aria-pressed', isStackedChart ? 'true' : 'false');
        toggleStackedChartElement.classList.toggle('is-link', isStackedChart);
    };
    const updateCopierVisibility = () => {
        for (const copierOptionElement of copierOptionElements) {
            const checkboxElement = copierOptionElement.querySelector('.js-copier-checkbox');
            const copierName = copierOptionElement.dataset.copierName ?? '';
            const matchesFilter = copierName.includes(copierNameFilterText);
            const isSelected = checkboxElement instanceof HTMLInputElement && checkboxElement.checked;
            copierOptionElement.classList.toggle('is-hidden', !matchesFilter || (!showHiddenCopiers && !isSelected));
        }
    };
    for (const checkboxElement of checkboxElements) {
        checkboxElement.addEventListener('change', () => {
            storeSelectedCopierIds();
            updateChart();
            updateCopierVisibility();
            updateKpis();
        });
    }
    chartDurationDaysElement.value = String(dashboardData.defaultDurationDays);
    chartDurationDaysElement.addEventListener('change', () => {
        updateCopierCountsForDuration();
        updateChart();
        updateCopierVisibility();
        updateKpis();
    });
    if (copierFilterElement instanceof HTMLInputElement) {
        copierFilterElement.addEventListener('input', () => {
            copierNameFilterText = copierFilterElement.value.trim().toLowerCase();
            updateCopierVisibility();
        });
    }
    toggleHiddenCopiersElement.addEventListener('click', () => {
        showHiddenCopiers = !showHiddenCopiers;
        updateHiddenCopiersButton();
        updateCopierVisibility();
    });
    toggleStackedChartElement.addEventListener('click', () => {
        isStackedChart = !isStackedChart;
        updateStackedChartButton();
        updateChart();
    });
    selectAllCopiersElement.addEventListener('click', () => {
        applySelectedCopierIds(new Set(dashboardData.copiers.map((copier) => copier.copierId)));
        storeSelectedCopierIds();
        updateChart();
        updateCopierVisibility();
        updateKpis();
    });
    deselectAllCopiersElement.addEventListener('click', () => {
        applySelectedCopierIds(new Set());
        storeSelectedCopierIds();
        updateChart();
        updateCopierVisibility();
        updateKpis();
    });
    resetCopierSelectionElement.addEventListener('click', () => {
        applySelectedCopierIds(getDefaultSelectedCopierIds());
        storeSelectedCopierIds();
        updateChart();
        updateCopierVisibility();
        updateKpis();
    });
    const aboutModalElement = document.querySelector('#aboutModal');
    const aboutModalCloseElements = document.querySelectorAll('.js-about-modal-close');
    if (aboutModalElement instanceof HTMLDivElement) {
        const aboutVideoElement = aboutModalElement.querySelector('video');
        const openAboutModal = () => {
            if (aboutVideoElement instanceof HTMLVideoElement) {
                aboutVideoElement.currentTime = 0;
                void aboutVideoElement.play();
            }
            aboutModalElement.classList.add('is-active');
        };
        const closeAboutModal = () => {
            aboutModalElement.classList.remove('is-active');
            if (aboutVideoElement instanceof HTMLVideoElement) {
                aboutVideoElement.pause();
                aboutVideoElement.currentTime = 0;
            }
        };
        document.querySelector('#aboutLink')?.addEventListener('click', (event) => {
            event.preventDefault();
            openAboutModal();
        });
        for (const closeElement of aboutModalCloseElements) {
            closeElement.addEventListener('click', closeAboutModal);
        }
        openAboutModal();
    }
    const tipsModalElement = document.querySelector('#tipsModal');
    const tipsModalCloseElements = document.querySelectorAll('.js-tips-modal-close');
    if (tipsModalElement instanceof HTMLDivElement) {
        const openTipsModal = () => {
            tipsModalElement.classList.add('is-active');
        };
        const closeTipsModal = () => {
            tipsModalElement.classList.remove('is-active');
        };
        document.querySelector('#tipsLink')?.addEventListener('click', (event) => {
            event.preventDefault();
            openTipsModal();
        });
        for (const closeElement of tipsModalCloseElements) {
            closeElement.addEventListener('click', closeTipsModal);
        }
    }
    updateCopierCountsForDuration();
    const storedSelectedCopierIds = loadSelectedCopierIds();
    applySelectedCopierIds(storedSelectedCopierIds ?? getDefaultSelectedCopierIds());
    updateHiddenCopiersButton();
    updateStackedChartButton();
    updateChart();
    updateCopierVisibility();
    updateKpis();
    window.addEventListener('resize', () => {
        chart.resize();
    });
})();
