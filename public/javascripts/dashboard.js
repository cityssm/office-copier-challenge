const HOUR_MILLIS = 60 * 60 * 1000;
const DAY_MILLIS = 24 * HOUR_MILLIS;
const DEFAULT_SELECTED_COPIER_COUNT = 9;
const LOW_PRINT_THRESHOLD = 5;
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
            shadedRanges.push([{ xAxis: morningRange[0] }, { xAxis: morningRange[1] }]);
        }
        const eveningRange = clampRange(dayStartMillis + 17 * HOUR_MILLIS, dayEndMillis, startMillis, endMillis);
        if (eveningRange !== undefined) {
            shadedRanges.push([{ xAxis: eveningRange[0] }, { xAxis: eveningRange[1] }]);
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
    for (const { copier } of copierHourlyDeltas) {
        let currentRun = 0;
        let previousWasTop = false;
        let longestRun = 0;
        for (let index = 0; index < allHours.length; index++) {
            const timeMillis = allHours[index];
            const topCopierNames = hourTopCopierNames.get(timeMillis) ?? [];
            const isTopCopier = topCopierNames.includes(copier.copierName);
            const isConsecutive = index > 0 && allHours[index] - allHours[index - 1] === HOUR_MILLIS;
            if (isTopCopier) {
                currentRun = isConsecutive && previousWasTop ? currentRun + 1 : 1;
            }
            else {
                currentRun = 0;
            }
            previousWasTop = isTopCopier;
            longestRun = Math.max(longestRun, currentRun);
        }
        longestTopRunByCopierName.set(copier.copierName, longestRun);
    }
    const longestTopRun = Math.max(...longestTopRunByCopierName.values(), 0);
    const longestTopCopierNames = longestTopRun > 0
        ? getWinningCopierNames([...longestTopRunByCopierName.entries()]
            .filter(([, run]) => run === longestTopRun)
            .map(([copierName]) => copierName), true)
        : [];
    const longestActiveRunByCopierName = new Map();
    for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
        let currentRun = 0;
        let longestRun = 0;
        for (let index = 0; index < hourlyDeltas.length; index++) {
            const [timeMillis, prints] = hourlyDeltas[index];
            const isConsecutive = index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS;
            if (prints > 0) {
                currentRun = isConsecutive && currentRun > 0 ? currentRun + 1 : 1;
            }
            else {
                currentRun = 0;
            }
            longestRun = Math.max(longestRun, currentRun);
        }
        longestActiveRunByCopierName.set(copier.copierName, longestRun);
    }
    const longestActiveRun = Math.max(...longestActiveRunByCopierName.values(), 0);
    const longestActiveCopierNames = longestActiveRun > 0
        ? getWinningCopierNames([...longestActiveRunByCopierName.entries()]
            .filter(([, run]) => run === longestActiveRun)
            .map(([copierName]) => copierName), true)
        : [];
    const longestLowRunByCopierName = new Map();
    for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
        let currentRun = 0;
        let longestRun = 0;
        for (let index = 0; index < hourlyDeltas.length; index++) {
            const [timeMillis, prints] = hourlyDeltas[index];
            const isConsecutive = index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS;
            if (prints < LOW_PRINT_THRESHOLD) {
                if (isConsecutive && currentRun > 0) {
                    currentRun++;
                }
                else {
                    currentRun = 1;
                }
            }
            else {
                currentRun = 0;
            }
            longestRun = Math.max(longestRun, currentRun);
        }
        longestLowRunByCopierName.set(copier.copierName, longestRun);
    }
    const longestLowRun = Math.max(...longestLowRunByCopierName.values(), 0);
    const longestLowCopierNames = longestLowRun > 0
        ? getWinningCopierNames([...longestLowRunByCopierName.entries()]
            .filter(([, run]) => run === longestLowRun)
            .map(([copierName]) => copierName), false)
        : [];
    return {
        busiestHour: busiestHourTime !== undefined
            ? { timeMillis: busiestHourTime, totalPrints: busiestHourTotal }
            : undefined,
        busiestCopierHour,
        mostConsecutiveTopCopier: longestTopCopierNames.length > 0
            ? { copierNames: longestTopCopierNames, hours: longestTopRun }
            : undefined,
        mostConsecutiveActiveHours: longestActiveCopierNames.length > 0
            ? { copierNames: longestActiveCopierNames, hours: longestActiveRun }
            : undefined,
        mostConsecutiveLowPrint: longestLowCopierNames.length > 0
            ? { copierNames: longestLowCopierNames, hours: longestLowRun }
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
            (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) * DAY_MILLIS;
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
                    const timeHeader = useDailyCounts
                        ? new Date(tooltipItems[0].axisValue).toLocaleDateString()
                        : formatTooltipDateTime(new Date(tooltipItems[0].axisValue));
                    return [
                        timeHeader,
                        ...tooltipItems.map((point) => `${point.marker} ${point.seriesName}: ${point.value[1]}`)
                    ].join('<br/>');
                }
            },
            legend: {
                type: 'scroll'
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
    const copierFilterElement = document.querySelector('#copierNameFilter');
    const copierOptionElements = document.querySelectorAll('.js-copier-option');
    let showHiddenCopiers = false;
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
    const updateKpis = () => {
        const kpiSectionElement = document.querySelector('#kpiSection');
        if (!(kpiSectionElement instanceof HTMLElement)) {
            return;
        }
        const { cutoffMillis } = getDurationRange();
        const kpis = computeKpisForRange(dashboardData.copiers, cutoffMillis);
        const setKpiText = (id, text) => {
            const element = document.querySelector(`#${id}`);
            if (element instanceof HTMLElement) {
                element.textContent = text;
            }
        };
        const noData = 'No data available';
        const hourWord = (count) => (count === 1 ? 'hour' : 'hours');
        if (kpis.busiestHour !== undefined) {
            setKpiText('kpiBusiestHour', `${formatTooltipDateTime(new Date(kpis.busiestHour.timeMillis))} (${kpis.busiestHour.totalPrints.toLocaleString()} prints)`);
        }
        else {
            setKpiText('kpiBusiestHour', noData);
        }
        if (kpis.busiestCopierHour !== undefined) {
            const busiestCopierHourLabel = kpis.busiestCopierHour.copierHours
                .map((copierHour) => `${copierHour.copierName}, ${formatTooltipDateTime(new Date(copierHour.timeMillis))}`)
                .join('; ');
            setKpiText('kpiBusiestCopierHour', `${busiestCopierHourLabel} (${kpis.busiestCopierHour.prints.toLocaleString()} prints)`);
        }
        else {
            setKpiText('kpiBusiestCopierHour', noData);
        }
        if (kpis.mostConsecutiveTopCopier !== undefined) {
            setKpiText('kpiTopCopierStreak', `${kpis.mostConsecutiveTopCopier.copierNames.join(', ')} (${kpis.mostConsecutiveTopCopier.hours} ${hourWord(kpis.mostConsecutiveTopCopier.hours)})`);
        }
        else {
            setKpiText('kpiTopCopierStreak', noData);
        }
        if (kpis.mostConsecutiveActiveHours !== undefined) {
            setKpiText('kpiActiveStreak', `${kpis.mostConsecutiveActiveHours.copierNames.join(', ')} (${kpis.mostConsecutiveActiveHours.hours} ${hourWord(kpis.mostConsecutiveActiveHours.hours)})`);
        }
        else {
            setKpiText('kpiActiveStreak', noData);
        }
        if (kpis.mostConsecutiveLowPrint !== undefined) {
            setKpiText('kpiLowPrintStreak', `${kpis.mostConsecutiveLowPrint.copierNames.join(', ')} (${kpis.mostConsecutiveLowPrint.hours} ${hourWord(kpis.mostConsecutiveLowPrint.hours)})`);
        }
        else {
            setKpiText('kpiLowPrintStreak', noData);
        }
    };
    const getPrintCountInRange = (copier, cutoffMillis) => {
        return buildHourlyDeltaSeries(copier.hourlyCounts)
            .filter(([timeMillis]) => timeMillis >= cutoffMillis)
            .reduce((total, [, printCount]) => total + printCount, 0);
    };
    const updateCopierCheckboxesForDuration = () => {
        const { cutoffMillis } = getDurationRange();
        const copierCounts = dashboardData.copiers.map((copier) => ({
            copierId: copier.copierId,
            copierName: copier.copierName,
            printCount: getPrintCountInRange(copier, cutoffMillis)
        }));
        for (const copierCount of copierCounts) {
            const checkboxElement = document.querySelector(`.js-copier-checkbox[value="${copierCount.copierId}"]`);
            const countElement = checkboxElement
                ?.closest('.js-copier-option')
                ?.querySelector('.js-copier-count');
            if (countElement instanceof HTMLSpanElement) {
                countElement.textContent = copierCount.printCount.toLocaleString();
            }
        }
        const selectedCopierIds = new Set(copierCounts
            .toSorted((copierA, copierB) => {
            if (copierB.printCount !== copierA.printCount) {
                return copierB.printCount - copierA.printCount;
            }
            return copierA.copierName.localeCompare(copierB.copierName);
        })
            .slice(0, DEFAULT_SELECTED_COPIER_COUNT)
            .map((copier) => copier.copierId));
        for (const checkboxElement of checkboxElements) {
            checkboxElement.checked = selectedCopierIds.has(Number(checkboxElement.value));
        }
    };
    const updateHiddenCopiersButton = () => {
        toggleHiddenCopiersElement.textContent = showHiddenCopiers
            ? 'Hide hidden copiers'
            : 'Show hidden copiers';
        toggleHiddenCopiersElement.setAttribute('aria-pressed', showHiddenCopiers ? 'true' : 'false');
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
            updateChart();
            updateCopierVisibility();
        });
    }
    chartDurationDaysElement.value = String(dashboardData.defaultDurationDays);
    chartDurationDaysElement.addEventListener('change', () => {
        updateCopierCheckboxesForDuration();
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
    const aboutModalElement = document.querySelector('#aboutModal');
    const aboutModalCloseElements = document.querySelectorAll('.js-about-modal-close');
    if (aboutModalElement instanceof HTMLDivElement) {
        const openAboutModal = () => {
            aboutModalElement.classList.add('is-active');
        };
        const closeAboutModal = () => {
            aboutModalElement.classList.remove('is-active');
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
    updateCopierCheckboxesForDuration();
    updateHiddenCopiersButton();
    updateChart();
    updateCopierVisibility();
    updateKpis();
    window.addEventListener('resize', () => {
        chart.resize();
    });
})();
