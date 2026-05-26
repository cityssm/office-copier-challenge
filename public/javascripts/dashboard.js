"use strict";
function buildHourlyDeltaSeries(hourlyCounts) {
    const deltaSeries = [];
    let previousCountValue;
    for (const hourlyCount of hourlyCounts) {
        if (previousCountValue !== undefined) {
            deltaSeries.push([
                hourlyCount.timeMillis,
                Math.max(0, hourlyCount.countValue - previousCountValue)
            ]);
        }
        previousCountValue = hourlyCount.countValue;
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
    for (const checkboxElement of checkboxElements) {
        checkboxElement.checked = dashboardData.defaultCopierIds.includes(Number(checkboxElement.value));
        checkboxElement.addEventListener('change', () => {
            updateChart();
        });
    }
    updateChart();
    window.addEventListener('resize', () => {
        chart.resize();
    });
})();
