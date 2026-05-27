import type { EChartsType } from 'echarts/types/dist/echarts'

const HOUR_MILLIS = 60 * 60 * 1000
const DAY_MILLIS = 24 * HOUR_MILLIS
const DEFAULT_SELECTED_COPIER_COUNT = 9

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
  holidayDayStartMillis: number[]
  durationOptions: Array<{
    days: number
    label: string
  }>
}

interface DashboardChartSeries {
  name: string
  type: 'line'
  showSymbol: boolean
  data: Array<[number, number]>
  markArea?: {
    silent: boolean
    tooltip: {
      show: false
    }
    itemStyle: {
      color: string
    }
    data: Array<[{ xAxis: number }, { xAxis: number }]>
  }
}

declare const echarts: {
  init: (dom: HTMLElement) => EChartsType
}

function normalizeToHour(timeMillis: number): number {
  return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS
}

function normalizeToDay(timeMillis: number): number {
  return Math.floor(timeMillis / DAY_MILLIS) * DAY_MILLIS
}

function normalizeToLocalDay(timeMillis: number): number {
  const date = new Date(timeMillis)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addLocalDay(timeMillis: number): number {
  const date = new Date(timeMillis)
  date.setDate(date.getDate() + 1)
  return date.getTime()
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

function formatTooltipDateTime(date: Date): string {
  return `${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })} ${formatHourAmPm(date)}`
}

function clampRange(
  rangeStartMillis: number,
  rangeEndMillis: number,
  minMillis: number,
  maxMillis: number
): [startMillis: number, endMillis: number] | undefined {
  const clampedStartMillis = Math.max(rangeStartMillis, minMillis)
  const clampedEndMillis = Math.min(rangeEndMillis, maxMillis)

  return clampedStartMillis < clampedEndMillis
    ? [clampedStartMillis, clampedEndMillis]
    : undefined
}

function buildShadedTimeRanges(
  startMillis: number,
  endMillis: number,
  useDailyCounts: boolean,
  holidayDayStartMillis: number[]
): Array<[{ xAxis: number }, { xAxis: number }]> {
  if (endMillis <= startMillis) {
    return []
  }

  const shadedRanges: Array<[{ xAxis: number }, { xAxis: number }]> = []
  const holidayDayStartSet = new Set<number>(holidayDayStartMillis)

  for (
    let dayStartMillis = normalizeToLocalDay(startMillis);
    dayStartMillis < endMillis;
    dayStartMillis = addLocalDay(dayStartMillis)
  ) {
    const dayEndMillis = addLocalDay(dayStartMillis)
    const dayOfWeek = new Date(dayStartMillis).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidayDayStartSet.has(dayStartMillis)

    if (isWeekend || isHoliday) {
      const weekendRange = clampRange(
        dayStartMillis,
        dayEndMillis,
        startMillis,
        endMillis
      )

      if (weekendRange !== undefined) {
        shadedRanges.push([
          { xAxis: weekendRange[0] },
          { xAxis: weekendRange[1] }
        ])
      }

      continue
    }

    if (useDailyCounts) {
      continue
    }

    const morningRange = clampRange(
      dayStartMillis,
      dayStartMillis + 7 * HOUR_MILLIS,
      startMillis,
      endMillis
    )

    if (morningRange !== undefined) {
      shadedRanges.push([{ xAxis: morningRange[0] }, { xAxis: morningRange[1] }])
    }

    const eveningRange = clampRange(
      dayStartMillis + 17 * HOUR_MILLIS,
      dayEndMillis,
      startMillis,
      endMillis
    )

    if (eveningRange !== undefined) {
      shadedRanges.push([{ xAxis: eveningRange[0] }, { xAxis: eveningRange[1] }])
    }
  }

  return shadedRanges
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
    const nowMillis = Date.now()
    const cutoffMillis =
      nowMillis -
      (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) * DAY_MILLIS

    const useDailyCounts = selectedDurationDays === 30 || selectedDurationDays === 60
    const shadedTimeRanges = buildShadedTimeRanges(
      cutoffMillis,
      nowMillis,
      useDailyCounts,
      dashboardData.holidayDayStartMillis
    )

    const selectedCopierIds = [
      ...document.querySelectorAll<HTMLInputElement>('.js-copier-checkbox:checked')
    ].map((checkboxElement) => Number(checkboxElement.value))

    const selectedCopiers = selectedCopierIds
      .map((copierId) => copierDataById.get(copierId))
      .filter((copier): copier is DashboardCopier => copier !== undefined)

    chart.clear()

    const series: DashboardChartSeries[] = selectedCopiers.map((copier) => ({
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
      }
    }

    chart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (tooltipItems: Array<{
          axisValue: number
          marker: string
          seriesName: string
          value: [number, number]
        }>) => {
          const timeHeader = useDailyCounts
            ? new Date(tooltipItems[0].axisValue).toLocaleDateString()
            : formatTooltipDateTime(new Date(tooltipItems[0].axisValue))

          return [
            timeHeader,
            ...tooltipItems.map(
              (point) => `${point.marker} ${point.seriesName}: ${point.value[1]}`
            )
          ].join('<br/>')
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
              formatter: (value: number) => formatHourAmPm(new Date(value))
            }
      },
      yAxis: {
        type: 'value',
        name: useDailyCounts ? 'Daily Prints' : 'Hourly Prints'
      },
      series
    })
  }

  const checkboxElements = document.querySelectorAll<HTMLInputElement>(
    '.js-copier-checkbox'
  )
  const copierFilterElement = document.querySelector('#copierNameFilter')
  const copierOptionElements = document.querySelectorAll<HTMLDivElement>(
    '.js-copier-option'
  )
  let showHiddenCopiers = false
  let copierNameFilterText = ''

  const getDurationRange = (): {
    cutoffMillis: number
  } => {
    const selectedDurationDays = Number(chartDurationDaysElement.value)
    const nowMillis = Date.now()

    return {
      cutoffMillis:
        nowMillis -
        (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) *
          DAY_MILLIS
    }
  }

  const getPrintCountInRange = (
    copier: DashboardCopier,
    cutoffMillis: number
  ): number => {
    return buildHourlyDeltaSeries(copier.hourlyCounts)
      .filter(([timeMillis]) => timeMillis >= cutoffMillis)
      .reduce((total, [, printCount]) => total + printCount, 0)
  }

  const updateCopierCheckboxesForDuration = (): void => {
    const { cutoffMillis } = getDurationRange()
    const copierCounts = dashboardData.copiers.map((copier) => ({
      copierId: copier.copierId,
      copierName: copier.copierName,
      printCount: getPrintCountInRange(copier, cutoffMillis)
    }))

    for (const copierCount of copierCounts) {
      const checkboxElement = document.querySelector<HTMLInputElement>(
        `.js-copier-checkbox[value="${copierCount.copierId}"]`
      )
      const countElement = checkboxElement
        ?.closest('.js-copier-option')
        ?.querySelector('.js-copier-count')

      if (countElement instanceof HTMLSpanElement) {
        countElement.textContent = copierCount.printCount.toLocaleString()
      }
    }

    const selectedCopierIds = new Set(
      copierCounts
        .toSorted((copierA, copierB) => {
          if (copierB.printCount !== copierA.printCount) {
            return copierB.printCount - copierA.printCount
          }

          return copierA.copierName.localeCompare(copierB.copierName)
        })
        .slice(0, DEFAULT_SELECTED_COPIER_COUNT)
        .map((copier) => copier.copierId)
    )

    for (const checkboxElement of checkboxElements) {
      checkboxElement.checked = selectedCopierIds.has(Number(checkboxElement.value))
    }
  }

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
    for (const copierOptionElement of copierOptionElements) {
      const checkboxElement = copierOptionElement.querySelector('.js-copier-checkbox')
      const copierName = copierOptionElement.dataset.copierName ?? ''
      const matchesFilter = copierName.includes(copierNameFilterText)
      const isSelected =
        checkboxElement instanceof HTMLInputElement && checkboxElement.checked

      copierOptionElement.classList.toggle(
        'is-hidden',
        !matchesFilter || (!showHiddenCopiers && !isSelected)
      )
    }
  }

  for (const checkboxElement of checkboxElements) {
    checkboxElement.addEventListener('change', () => {
      updateChart()
      updateCopierVisibility()
    })
  }

  chartDurationDaysElement.value = String(dashboardData.defaultDurationDays)
  chartDurationDaysElement.addEventListener('change', () => {
    updateCopierCheckboxesForDuration()
    updateChart()
    updateCopierVisibility()
  })

  if (copierFilterElement instanceof HTMLInputElement) {
    copierFilterElement.addEventListener('input', () => {
      copierNameFilterText = copierFilterElement.value.trim().toLowerCase()
      updateCopierVisibility()
    })
  }

  toggleHiddenCopiersElement.addEventListener('click', () => {
    showHiddenCopiers = !showHiddenCopiers
    updateHiddenCopiersButton()
    updateCopierVisibility()
  })

  const aboutModalElement = document.querySelector('#aboutModal')
  const aboutModalCloseElements = document.querySelectorAll('.js-about-modal-close')

  if (aboutModalElement instanceof HTMLDivElement) {
    const openAboutModal = (): void => {
      aboutModalElement.classList.add('is-active')
    }

    const closeAboutModal = (): void => {
      aboutModalElement.classList.remove('is-active')
    }

    document.querySelector('#aboutLink')?.addEventListener('click', (event) => {
      event.preventDefault()
      openAboutModal()
    })

    for (const closeElement of aboutModalCloseElements) {
      closeElement.addEventListener('click', closeAboutModal)
    }

    openAboutModal()
  }

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

  updateCopierCheckboxesForDuration()
  updateHiddenCopiersButton()
  updateChart()
  updateCopierVisibility()

  window.addEventListener('resize', () => {
    chart.resize()
  })
})()
