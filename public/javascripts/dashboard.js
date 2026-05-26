"use strict";
const HOUR_MILLIS = 60 * 60 * 1000;
function normalizeToHour(timeMillis) {
    return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS;
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
        const selectedCopierIds = [
            ...document.querySelectorAll('.js-copier-checkbox:checked')
        ].map((checkboxElement) => Number(checkboxElement.value));
        const selectedCopiers = selectedCopierIds
            .map((copierId) => copierDataById.get(copierId))
            .filter((copier) => copier !== undefined);
        chart.clear();
        chart.setOption({
            animation: false,
            tooltip: {
                trigger: 'axis'
            },
            legend: {
                type: 'scroll'
            },
            xAxis: {
                type: 'time'
            },
            yAxis: {
                type: 'value',
                name: 'Hourly Prints'
            },
            series: selectedCopiers.map((copier) => ({
                name: copier.copierName,
                type: 'line',
                showSymbol: false,
                data: buildHourlyDeltaSeries(copier.hourlyCounts)
            }))
        });
    };
    const checkboxElements = document.querySelectorAll('.js-copier-checkbox');
    let showHiddenCopiers = false;
    const updateHiddenCopiersButton = () => {
        toggleHiddenCopiersElement.textContent = showHiddenCopiers
            ? 'Hide hidden copiers'
            : 'Show hidden copiers';
        toggleHiddenCopiersElement.setAttribute('aria-pressed', showHiddenCopiers ? 'true' : 'false');
    };
    const updateCopierVisibility = () => {
        for (const checkboxElement of checkboxElements) {
            const copierOptionElement = checkboxElement.closest('.js-copier-option');
            if (!(copierOptionElement instanceof HTMLDivElement)) {
                continue;
            }
            copierOptionElement.classList.toggle('is-hidden', !showHiddenCopiers && !checkboxElement.checked);
        }
    };
    for (const checkboxElement of checkboxElements) {
        checkboxElement.checked = dashboardData.defaultCopierIds.includes(Number(checkboxElement.value));
        checkboxElement.addEventListener('change', () => {
            updateChart();
            updateCopierVisibility();
        });
    }
    toggleHiddenCopiersElement.addEventListener('click', () => {
        showHiddenCopiers = !showHiddenCopiers;
        updateHiddenCopiersButton();
        updateCopierVisibility();
    });
    updateHiddenCopiersButton();
    updateChart();
    updateCopierVisibility();
    window.addEventListener('resize', () => {
        chart.resize();
    });
})();
