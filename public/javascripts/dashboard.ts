const HOUR_MILLIS = 60 * 60 * 1000
const DAY_MILLIS = 24 * HOUR_MILLIS

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
  defaultDurationDays: number
  durationOptions: Array<{
    days: number
    label: string
  }>
}

function normalizeToHour(timeMillis: number): number {
  return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS
}

function normalizeToDay(timeMillis: number): number {
  return Math.floor(timeMillis / DAY_MILLIS) * DAY_MILLIS
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

function buildDailyDeltaSeries(
  hourlyCounts: DashboardPoint[]
): Array<[timeMillis: number, dailyPrints: number]> {
  const hourlyDeltas = buildHourlyDeltaSeries(hourlyCounts)

  const dailyPrints = new Map<number, number>()

  for (const [timeMillis, prints] of hourlyDeltas) {
    const dayStartMillis = normalizeToDay(timeMillis)
    dailyPrints.set(dayStartMillis, (dailyPrints.get(dayStartMillis) ?? 0) + prints)
  }

  return [...dailyPrints.entries()].toSorted(([dayA], [dayB]) => dayA - dayB)
}

function formatHourAmPm(date: Date): string {
  const hours = date.getHours()
  const ampm = hours < 12 ? 'am' : 'pm'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12} ${ampm}`
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

  const chartDurationDaysElement = document.querySelector('#chartDurationDays')

  if (!(chartDurationDaysElement instanceof HTMLSelectElement)) {
    return
  }

  const toggleHiddenCopiersElement = document.querySelector(
    '#toggleHiddenCopiers'
  )

  if (!(toggleHiddenCopiersElement instanceof HTMLButtonElement)) {
    return
  }

  const dashboardData = JSON.parse(dashboardDataElement.text) as DashboardData

  const copierDataById = new Map<number, DashboardCopier>()

  for (const copierData of dashboardData.copiers) {
    copierDataById.set(copierData.copierId, copierData)
  }

  const chart = echarts.init(chartContainerElement)

  const updateChart = (): void => {
    const selectedDurationDays = Number(chartDurationDaysElement.value)
    const cutoffMillis =
      Date.now() - (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) * DAY_MILLIS

    const useDailyCounts = selectedDurationDays === 30 || selectedDurationDays === 60

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
        type: 'time',
        axisLabel: useDailyCounts
          ? {}
          : {
              formatter: (value: number) => {
                return formatHourAmPm(new Date(value))
              }
            }
      },
      yAxis: {
        type: 'value',
        name: useDailyCounts ? 'Daily Prints' : 'Hourly Prints'
      },
      series: selectedCopiers.map((copier) => ({
        name: copier.copierName,
        type: 'line',
        showSymbol: false,
        data: useDailyCounts
          ? buildDailyDeltaSeries(copier.hourlyCounts).filter(
              ([timeMillis]) => timeMillis >= cutoffMillis
            )
          : buildHourlyDeltaSeries(copier.hourlyCounts).filter(
              ([timeMillis]) => timeMillis >= cutoffMillis
            )
      }))
    })
  }

  const checkboxElements = document.querySelectorAll<HTMLInputElement>(
    '.js-copier-checkbox'
  )
  let showHiddenCopiers = false

  const updateHiddenCopiersButton = (): void => {
    toggleHiddenCopiersElement.textContent = showHiddenCopiers
      ? 'Hide hidden copiers'
      : 'Show hidden copiers'
    toggleHiddenCopiersElement.setAttribute(
      'aria-pressed',
      showHiddenCopiers ? 'true' : 'false'
    )
  }

  const updateCopierVisibility = (): void => {
    for (const checkboxElement of checkboxElements) {
      const copierOptionElement = checkboxElement.closest('.js-copier-option')

      if (!(copierOptionElement instanceof HTMLDivElement)) {
        continue
      }

      copierOptionElement.classList.toggle(
        'is-hidden',
        !showHiddenCopiers && !checkboxElement.checked
      )
    }
  }

  for (const checkboxElement of checkboxElements) {
    checkboxElement.checked = dashboardData.defaultCopierIds.includes(
      Number(checkboxElement.value)
    )

    checkboxElement.addEventListener('change', () => {
      updateChart()
      updateCopierVisibility()
    })
  }

  chartDurationDaysElement.value = String(dashboardData.defaultDurationDays)
  chartDurationDaysElement.addEventListener('change', () => {
    updateChart()
  })

  toggleHiddenCopiersElement.addEventListener('click', () => {
    showHiddenCopiers = !showHiddenCopiers
    updateHiddenCopiersButton()
    updateCopierVisibility()
  })

  const tipsModalElement = document.querySelector('#tipsModal')
  const tipsModalCloseElements = document.querySelectorAll('.js-tips-modal-close')

  if (tipsModalElement instanceof HTMLDivElement) {
    const openTipsModal = (): void => {
      tipsModalElement.classList.add('is-active')
    }

    const closeTipsModal = (): void => {
      tipsModalElement.classList.remove('is-active')
    }

    document.querySelector('#tipsLink')?.addEventListener('click', (event) => {
      event.preventDefault()
      openTipsModal()
    })

    for (const closeElement of tipsModalCloseElements) {
      closeElement.addEventListener('click', closeTipsModal)
    }
  }

  updateHiddenCopiersButton()
  updateChart()
  updateCopierVisibility()

  window.addEventListener('resize', () => {
    chart.resize()
  })
})()
