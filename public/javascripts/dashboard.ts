const HOUR_MILLIS = 60 * 60 * 1000

interface DashboardPoint {
  timeMillis: number
  countValue: number
}

interface DashboardCopier {
  copierId: number
  copierName: string
  hourlyCounts: DashboardPoint[]
}

interface DashboardData {
  copiers: DashboardCopier[]
  defaultCopierIds: number[]
}

function normalizeToHour(timeMillis: number): number {
  return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS
}

function buildHourlyDeltaSeries(
  hourlyCounts: DashboardPoint[]
): Array<[timeMillis: number, hourlyPrints: number]> {
  const maximumCountByHour = new Map<number, number>()

  for (const hourlyCount of hourlyCounts) {
    const hourStartMillis = normalizeToHour(hourlyCount.timeMillis)
    const currentMaximumCount = maximumCountByHour.get(hourStartMillis)

    if (
      currentMaximumCount === undefined ||
      hourlyCount.countValue > currentMaximumCount
    ) {
      maximumCountByHour.set(hourStartMillis, hourlyCount.countValue)
    }
  }

  const sortedHourlyMaximums = [...maximumCountByHour.entries()].toSorted(
    ([hourA], [hourB]) => hourA - hourB
  )

  const deltaSeries: Array<[timeMillis: number, hourlyPrints: number]> = []
  let previousCountValue: number | undefined

  for (const [timeMillis, countValue] of sortedHourlyMaximums) {
    if (previousCountValue !== undefined) {
      deltaSeries.push([
        timeMillis,
        Math.max(0, countValue - previousCountValue)
      ])
    }

    previousCountValue = countValue
  }

  return deltaSeries
}

;(() => {
  const dashboardDataElement = document.querySelector('#dashboardData')

  if (!(dashboardDataElement instanceof HTMLScriptElement)) {
    return
  }

  const chartContainerElement = document.querySelector('#copierUsageChart')

  if (!(chartContainerElement instanceof HTMLDivElement)) {
    return
  }

  const dashboardData = JSON.parse(dashboardDataElement.text) as DashboardData

  const copierDataById = new Map<number, DashboardCopier>()

  for (const copierData of dashboardData.copiers) {
    copierDataById.set(copierData.copierId, copierData)
  }

  const chart = echarts.init(chartContainerElement)

  const updateChart = (): void => {
    const selectedCopierIds = [
      ...document.querySelectorAll<HTMLInputElement>('.js-copier-checkbox:checked')
    ].map((checkboxElement) => Number(checkboxElement.value))

    const selectedCopiers = selectedCopierIds
      .map((copierId) => copierDataById.get(copierId))
      .filter((copier): copier is DashboardCopier => copier !== undefined)

    chart.clear()

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
    })
  }

  const checkboxElements = document.querySelectorAll<HTMLInputElement>(
    '.js-copier-checkbox'
  )

  for (const checkboxElement of checkboxElements) {
    checkboxElement.checked = dashboardData.defaultCopierIds.includes(
      Number(checkboxElement.value)
    )

    checkboxElement.addEventListener('change', () => {
      updateChart()
    })
  }

  updateChart()

  window.addEventListener('resize', () => {
    chart.resize()
  })
})()
