/* eslint-disable max-lines */

import type { EChartsType } from 'echarts/types/dist/echarts'

const HOUR_MILLIS = 60 * 60 * 1000
const DAY_MILLIS = 24 * HOUR_MILLIS

const DEFAULT_SELECTED_COPIER_COUNT = 10

const SELECTED_COPIER_IDS_STORAGE_KEY =
  'office-copier-challenge.selectedCopierIds'
const SUPPRESS_ABOUT_MODAL_STORAGE_KEY =
  'office-copier-challenge.suppressAboutModalOnce'

const STACKED_TOOLBOX_ICON_PATH =
  'path://M64 96h384v64H64zM64 224h384v64H64zM64 352h384v64H64z'
const CSV_TOOLBOX_ICON_PATH =
  'path://M256 352L128 224h64V64h128v160h64zM64 416h384v64H64z'

const LOW_PRINT_THRESHOLD = 5
const DOUBLE_SIDED_PRINT_SHARE = 0.5
const PAGES_PER_REAM = 500
const REAMS_PER_CARTON = 10
const TREES_PER_CARTON = 0.6
const HIGH_USAGE_PRINT_SHARE_THRESHOLD = 0.2
const LOW_USAGE_PRINT_SHARE_THRESHOLD = 0.05

const COPIER_BAND_CLASSES = [
  'has-background-danger-light',
  'has-background-warning-light',
  'has-background-success-light'
]

const COPIER_ICON_CLASSES = [
  'has-text-danger',
  'has-text-warning',
  'has-text-success'
]

const COPIER_TIER_LABELS = [
  'Over 20% of total prints',
  '5% to 20% of total prints',
  'Under 5% of total prints'
]

interface DashboardPoint {
  timeMillis: number
  countValue: number
}

interface DashboardCopier {
  copierId: number
  copierName: string
  hourlyCounts: DashboardPoint[]
  totalPrints: number
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
  stack?: string
  areaStyle?: Record<string, never>
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
    dailyPrints.set(
      dayStartMillis,
      (dailyPrints.get(dayStartMillis) ?? 0) + prints
    )
  }

  return [...dailyPrints.entries()].toSorted(([dayA], [dayB]) => dayA - dayB)
}

function buildPaddedStackedSeries(
  series: DashboardChartSeries[],
  cutoffMillis: number,
  nowMillis: number,
  useDailyCounts: boolean
): DashboardChartSeries[] {
  if (series.length === 0) {
    return series
  }

  const slotMillis = useDailyCounts ? DAY_MILLIS : HOUR_MILLIS
  const normalizeTime = useDailyCounts ? normalizeToDay : normalizeToHour
  const rangeStartMillis = normalizeTime(cutoffMillis)
  const rangeEndMillis = normalizeTime(nowMillis)

  if (rangeEndMillis < rangeStartMillis) {
    return series
  }

  const timeSlots: number[] = []

  for (
    let timeMillis = rangeStartMillis;
    timeMillis <= rangeEndMillis;
    timeMillis += slotMillis
  ) {
    timeSlots.push(timeMillis)
  }

  return series.map((seriesItem) => {
    const valueByTime = new Map<number, number>()

    for (const [timeMillis, printCount] of seriesItem.data) {
      valueByTime.set(normalizeTime(timeMillis), printCount)
    }

    return {
      ...seriesItem,
      data: timeSlots.map((timeMillis) => [
        timeMillis,
        valueByTime.get(timeMillis) ?? 0
      ])
    }
  })
}

function formatCsvDate(timeMillis: number): string {
  const date = new Date(timeMillis)
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatCsvTime(timeMillis: number): string {
  const date = new Date(timeMillis)
  const hour = date.getHours().toString().padStart(2, '0')

  return `${hour}:00`
}

function escapeCsvValue(value: number | string): string {
  const valueAsString = String(value)

  return /[",\n\r]/.test(valueAsString)
    ? `"${valueAsString.replaceAll('"', '""')}"`
    : valueAsString
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

function formatEstimate(value: number): string {
  return value.toLocaleString()
}

function formatFractionalEstimate(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2
  })
}

function calculateEstimatedPaperImpact(totalPrints: number): {
  estimatedPages: number
  estimatedReams: number
  estimatedCartons: number
  estimatedTrees: number
} {
  const estimatedPages = Math.round(
    totalPrints * (1 - DOUBLE_SIDED_PRINT_SHARE + DOUBLE_SIDED_PRINT_SHARE / 2)
  )
  const estimatedReams = estimatedPages / PAGES_PER_REAM
  const estimatedCartons = estimatedReams / REAMS_PER_CARTON
  const estimatedTrees = estimatedCartons * TREES_PER_CARTON

  return {
    estimatedPages,
    estimatedReams,
    estimatedCartons,
    estimatedTrees
  }
}

function formatShortDate(timeMillis: number): string {
  return new Date(timeMillis).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getActualDataStartMillis(
  copiers: DashboardCopier[]
): number | undefined {
  let min: number | undefined

  for (const copier of copiers) {
    for (const point of copier.hourlyCounts) {
      if (min === undefined || point.timeMillis < min) {
        min = point.timeMillis
      }
    }
  }

  return min
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
      shadedRanges.push([
        { xAxis: morningRange[0] },
        { xAxis: morningRange[1] }
      ])
    }

    const eveningRange = clampRange(
      dayStartMillis + 17 * HOUR_MILLIS,
      dayEndMillis,
      startMillis,
      endMillis
    )

    if (eveningRange !== undefined) {
      shadedRanges.push([
        { xAxis: eveningRange[0] },
        { xAxis: eveningRange[1] }
      ])
    }
  }

  return shadedRanges
}

interface CopierHourResult {
  copierHours: Array<{ copierName: string; timeMillis: number }>
  prints: number
}

interface ConsecutiveHoursResult {
  copierStats: Array<{
    copierName: string
    startTimeMillis: number
    endTimeMillis: number
  }>
  hours: number
}

function computeKpisForRange(
  copiers: DashboardCopier[],
  cutoffMillis: number
): {
  busiestHour: { timeMillis: number; totalPrints: number } | undefined
  busiestHourRunnerUps: Array<{ timeMillis: number; totalPrints: number }>
  busiestCopierHour: CopierHourResult | undefined
  busiestCopierHourRunnerUps: CopierHourResult[]
  mostConsecutiveTopCopier: ConsecutiveHoursResult | undefined
  mostConsecutiveTopCopierRunnerUps: ConsecutiveHoursResult[]
  mostConsecutiveActiveHours: ConsecutiveHoursResult | undefined
  mostConsecutiveActiveHoursRunnerUps: ConsecutiveHoursResult[]
  mostConsecutiveLowPrint:
    | {
        copierStats: Array<{
          copierName: string
          prints: number
          startTimeMillis: number
          endTimeMillis: number
        }>
        hours: number
      }
    | undefined
  mostHoursLowPrintOverall: { copierNames: string[]; hours: number } | undefined
} {
  const totalPrintsByCopierName = new Map(
    copiers.map((copier) => [copier.copierName, copier.totalPrints])
  )

  function getWinningCopierNames(
    copierNames: string[],
    useHighestTotals: boolean
  ): string[] {
    const uniqueCopierNames = [...new Set(copierNames)]

    if (uniqueCopierNames.length <= 1) {
      return uniqueCopierNames
    }

    let targetTotalPrints: number | undefined

    for (const copierName of uniqueCopierNames) {
      const totalPrints = totalPrintsByCopierName.get(copierName) ?? 0

      if (
        targetTotalPrints === undefined ||
        (useHighestTotals
          ? totalPrints > targetTotalPrints
          : totalPrints < targetTotalPrints)
      ) {
        targetTotalPrints = totalPrints
      }
    }

    return uniqueCopierNames
      .filter(
        (copierName) =>
          (totalPrintsByCopierName.get(copierName) ?? 0) === targetTotalPrints
      )
      .toSorted((nameA, nameB) => nameA.localeCompare(nameB))
  }

  const copierHourlyDeltas = copiers.map((copier) => ({
    copier,
    hourlyDeltas: buildHourlyDeltaSeries(copier.hourlyCounts).filter(
      ([timeMillis]) => timeMillis >= cutoffMillis
    )
  }))

  // Build per-copier hour maps and collect all unique hours in range
  const allHoursSet = new Set<number>()
  const copierHourMaps = copierHourlyDeltas.map(({ copier, hourlyDeltas }) => {
    const hourMap = new Map<number, number>()
    for (const [timeMillis, prints] of hourlyDeltas) {
      hourMap.set(timeMillis, prints)
      allHoursSet.add(timeMillis)
    }
    return { copier, hourMap, hourlyDeltas }
  })

  const allHours = [...allHoursSet].toSorted((a, b) => a - b)

  // KPI 1a: Busiest hour overall (sum across all copiers) — top 3
  const hourTotals: Array<{ timeMillis: number; totalPrints: number }> = []
  for (const timeMillis of allHours) {
    let total = 0
    for (const { hourMap } of copierHourMaps) {
      total += hourMap.get(timeMillis) ?? 0
    }
    if (total > 0) {
      hourTotals.push({ timeMillis, totalPrints: total })
    }
  }
  hourTotals.sort(
    (a, b) => b.totalPrints - a.totalPrints || a.timeMillis - b.timeMillis
  )

  const topBusiestHours: Array<{ timeMillis: number; totalPrints: number }> = []
  let previousHourTotal = -1
  for (const hourTotal of hourTotals) {
    if (hourTotal.totalPrints !== previousHourTotal) {
      topBusiestHours.push(hourTotal)
      previousHourTotal = hourTotal.totalPrints
      if (topBusiestHours.length >= 3) break
    }
  }

  const busiestHourTime = topBusiestHours[0]?.timeMillis
  const busiestHourTotal = topBusiestHours[0]?.totalPrints ?? 0

  // KPI 1b: Busiest individual copier + hour
  // KPI 1b: Busiest individual copier + hour — top 3
  const buildCopierHourResult = (
    printCount: number,
    candidates: Array<{ copierName: string; timeMillis: number }>
  ): CopierHourResult => {
    const winningCopierNames = new Set(
      getWinningCopierNames(
        candidates.map((candidate) => candidate.copierName),
        true
      )
    )
    const earliestTimeByCopierName = new Map<string, number>()
    for (const candidate of candidates) {
      if (!winningCopierNames.has(candidate.copierName)) continue
      const existing = earliestTimeByCopierName.get(candidate.copierName)
      if (existing === undefined || candidate.timeMillis < existing) {
        earliestTimeByCopierName.set(candidate.copierName, candidate.timeMillis)
      }
    }
    return {
      copierHours: [...earliestTimeByCopierName.entries()]
        .map(([copierName, timeMillis]) => ({ copierName, timeMillis }))
        .toSorted((a, b) => a.copierName.localeCompare(b.copierName)),
      prints: printCount
    }
  }

  const allCopierHourPrints: Array<{
    copierName: string
    timeMillis: number
    prints: number
  }> = []
  for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
    for (const [timeMillis, prints] of hourlyDeltas) {
      if (prints > 0) {
        allCopierHourPrints.push({
          copierName: copier.copierName,
          timeMillis,
          prints
        })
      }
    }
  }

  // Sort copier-hour entries by (prints DESC, totalPrints DESC, copierName ASC, timeMillis ASC)
  // Group by (prints, totalPrints) pairs — same pair = same placement, max 3 placements
  const sortedCopierHourPrints = [...allCopierHourPrints].toSorted(
    (a, b) =>
      b.prints - a.prints ||
      (totalPrintsByCopierName.get(b.copierName) ?? 0) -
        (totalPrintsByCopierName.get(a.copierName) ?? 0) ||
      a.copierName.localeCompare(b.copierName) ||
      a.timeMillis - b.timeMillis
  )

  const copierHourPlacements: Array<{
    prints: number
    totalPrints: number
    candidates: Array<{ copierName: string; timeMillis: number }>
  }> = []

  for (const item of sortedCopierHourPrints) {
    const itemTotalPrints = totalPrintsByCopierName.get(item.copierName) ?? 0
    const lastPlacement = copierHourPlacements[copierHourPlacements.length - 1]

    if (
      lastPlacement !== undefined &&
      lastPlacement.prints === item.prints &&
      lastPlacement.totalPrints === itemTotalPrints
    ) {
      lastPlacement.candidates.push({ copierName: item.copierName, timeMillis: item.timeMillis })
    } else if (copierHourPlacements.length < 3) {
      copierHourPlacements.push({
        prints: item.prints,
        totalPrints: itemTotalPrints,
        candidates: [{ copierName: item.copierName, timeMillis: item.timeMillis }]
      })
    } else {
      break
    }
  }

  const topBusiestCopierHours: CopierHourResult[] = copierHourPlacements.map((placement) =>
    buildCopierHourResult(placement.prints, placement.candidates)
  )

  const busiestCopierHour = topBusiestCopierHours[0]

  // KPI 2a: Most consecutive hours as the top copier
  const hourTopCopierNames = new Map<number, string[]>()
  for (const timeMillis of allHours) {
    let topPrints = 0
    const topCopierNames: string[] = []

    for (const { copier, hourMap } of copierHourMaps) {
      const prints = hourMap.get(timeMillis) ?? 0

      if (prints > topPrints) {
        topPrints = prints
        topCopierNames.length = 0
        topCopierNames.push(copier.copierName)
      } else if (prints === topPrints && prints > 0) {
        topCopierNames.push(copier.copierName)
      }
    }

    if (topCopierNames.length > 0) {
      hourTopCopierNames.set(timeMillis, topCopierNames)
    }
  }

  const hourMapByCopierName = new Map(
    copierHourMaps.map(({ copier, hourMap }) => [copier.copierName, hourMap])
  )

  const longestTopRunByCopierName = new Map<string, number>()
  const longestTopRunPrintsByCopierName = new Map<string, number>()
  const longestTopRunRangeByCopierName = new Map<string, [number, number]>()

  for (const { copier } of copierHourlyDeltas) {
    let currentRun = 0
    let previousWasTop = false
    let longestRun = 0
    let currentRunPrints = 0
    let longestRunPrints = 0
    let currentRunStartMillis: number | undefined

    const hourMap = hourMapByCopierName.get(copier.copierName)

    for (let index = 0; index < allHours.length; index += 1) {
      const timeMillis = allHours[index]
      const topCopierNames = hourTopCopierNames.get(timeMillis) ?? []
      const isTopCopier = topCopierNames.includes(copier.copierName)
      const isConsecutive =
        index > 0 && allHours[index] - allHours[index - 1] === HOUR_MILLIS

      if (isTopCopier) {
        const prints = hourMap?.get(timeMillis) ?? 0

        if (isConsecutive && previousWasTop) {
          currentRun += 1
          currentRunPrints += prints
        } else {
          currentRun = 1
          currentRunPrints = prints
          currentRunStartMillis = timeMillis
        }
      } else {
        currentRun = 0
        currentRunPrints = 0
        currentRunStartMillis = undefined
      }

      previousWasTop = isTopCopier

      if (currentRun > longestRun && currentRunStartMillis !== undefined) {
        longestRun = currentRun
        longestRunPrints = currentRunPrints
        longestTopRunRangeByCopierName.set(copier.copierName, [
          currentRunStartMillis,
          timeMillis
        ])
      } else if (
        currentRun === longestRun &&
        currentRun > 0 &&
        currentRunPrints > longestRunPrints &&
        currentRunStartMillis !== undefined
      ) {
        longestRunPrints = currentRunPrints
        longestTopRunRangeByCopierName.set(copier.copierName, [
          currentRunStartMillis,
          timeMillis
        ])
      }
    }

    longestTopRunByCopierName.set(copier.copierName, longestRun)
    longestTopRunPrintsByCopierName.set(copier.copierName, longestRunPrints)
  }

  const longestTopRun = Math.max(...longestTopRunByCopierName.values(), 0)

  // Sort copiers by (run DESC, runPrints DESC, totalPrints DESC, copierName ASC)
  // Group by (run, runPrints) pairs — same pair = same placement, max 3 placements
  const topCopiersSorted = [...longestTopRunByCopierName.entries()]
    .filter(([, run]) => run > 1)
    .map(([copierName, run]) => ({
      copierName,
      run,
      runPrints: longestTopRunPrintsByCopierName.get(copierName) ?? 0,
      totalPrints: totalPrintsByCopierName.get(copierName) ?? 0
    }))
    .toSorted(
      (a, b) =>
        b.run - a.run ||
        b.runPrints - a.runPrints ||
        b.totalPrints - a.totalPrints ||
        a.copierName.localeCompare(b.copierName)
    )

  const topConsecutiveTopCopierResults: ConsecutiveHoursResult[] = []
  let lastTopPlacement: { run: number; runPrints: number } | undefined

  for (const { copierName, run, runPrints } of topCopiersSorted) {
    const range = longestTopRunRangeByCopierName.get(copierName)
    if (range === undefined) continue

    const stat = { copierName, startTimeMillis: range[0], endTimeMillis: range[1] }

    if (
      lastTopPlacement !== undefined &&
      lastTopPlacement.run === run &&
      lastTopPlacement.runPrints === runPrints
    ) {
      topConsecutiveTopCopierResults[topConsecutiveTopCopierResults.length - 1].copierStats.push(stat)
    } else if (topConsecutiveTopCopierResults.length < 3) {
      topConsecutiveTopCopierResults.push({ hours: run, copierStats: [stat] })
      lastTopPlacement = { run, runPrints }
    } else {
      break
    }
  }

  // KPI 2b: Most consecutive hours with copies > 0
  const longestActiveRunByCopierName = new Map<string, number>()
  const longestActiveRunRangeByCopierName = new Map<string, [number, number]>()

  for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
    let currentRun = 0
    let longestRun = 0
    let currentRunStartMillis: number | undefined

    for (let index = 0; index < hourlyDeltas.length; index += 1) {
      const [timeMillis, prints] = hourlyDeltas[index]
      const isConsecutive =
        index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS

      if (prints > 0) {
        if (isConsecutive && currentRun > 0) {
          currentRun += 1
        } else {
          currentRun = 1
          currentRunStartMillis = timeMillis
        }
      } else {
        currentRun = 0
        currentRunStartMillis = undefined
      }

      if (currentRun > longestRun && currentRunStartMillis !== undefined) {
        longestRun = currentRun
        longestActiveRunRangeByCopierName.set(copier.copierName, [
          currentRunStartMillis,
          timeMillis
        ])
      }
    }

    longestActiveRunByCopierName.set(copier.copierName, longestRun)
  }

  const longestActiveRun = Math.max(...longestActiveRunByCopierName.values(), 0)

  // Sort copiers by (run DESC, totalPrints DESC, copierName ASC)
  // Group by (run, totalPrints) pairs — same pair = same placement, max 3 placements
  const activeCopiersSorted = [...longestActiveRunByCopierName.entries()]
    .filter(([, run]) => run > 1)
    .map(([copierName, run]) => ({
      copierName,
      run,
      totalPrints: totalPrintsByCopierName.get(copierName) ?? 0
    }))
    .toSorted((a, b) => b.run - a.run || b.totalPrints - a.totalPrints || a.copierName.localeCompare(b.copierName))

  const topConsecutiveActiveHoursResults: ConsecutiveHoursResult[] = []
  let lastActivePlacement: { run: number; totalPrints: number } | undefined

  for (const { copierName, run, totalPrints } of activeCopiersSorted) {
    const range = longestActiveRunRangeByCopierName.get(copierName)
    if (range === undefined) continue

    const stat = { copierName, startTimeMillis: range[0], endTimeMillis: range[1] }

    if (
      lastActivePlacement !== undefined &&
      lastActivePlacement.run === run &&
      lastActivePlacement.totalPrints === totalPrints
    ) {
      topConsecutiveActiveHoursResults[topConsecutiveActiveHoursResults.length - 1].copierStats.push(stat)
    } else if (topConsecutiveActiveHoursResults.length < 3) {
      topConsecutiveActiveHoursResults.push({ hours: run, copierStats: [stat] })
      lastActivePlacement = { run, totalPrints }
    } else {
      break
    }
  }

  // KPI 3: Most consecutive hours with fewer than 5 copies
  const longestLowRunByCopierName = new Map<string, number>()
  const longestLowRunRangeByCopierName = new Map<string, [number, number]>()
  const longestLowRunPrintsByCopierName = new Map<string, number>()
  const lowPrintHoursByCopierName = new Map<string, number>()

  for (const { copier, hourlyDeltas } of copierHourlyDeltas) {
    let currentRun = 0
    let currentRunPrints = 0
    let longestRun = 0
    let longestRunPrints: number | undefined
    let currentRunStartMillis: number | undefined
    let lowPrintHours = 0

    for (let index = 0; index < hourlyDeltas.length; index += 1) {
      const [timeMillis, prints] = hourlyDeltas[index]
      const isConsecutive =
        index > 0 && timeMillis - hourlyDeltas[index - 1][0] === HOUR_MILLIS

      if (prints < LOW_PRINT_THRESHOLD) {
        lowPrintHours += 1
        if (isConsecutive && currentRun > 0) {
          currentRun += 1
          currentRunPrints += prints
        } else {
          currentRun = 1
          currentRunPrints = prints
          currentRunStartMillis = timeMillis
        }
      } else {
        currentRun = 0
        currentRunPrints = 0
        currentRunStartMillis = undefined
      }

      if (currentRun > longestRun && currentRunStartMillis !== undefined) {
        longestRun = currentRun
        longestRunPrints = currentRunPrints
        longestLowRunRangeByCopierName.set(copier.copierName, [
          currentRunStartMillis,
          timeMillis
        ])
      } else if (
        currentRun === longestRun &&
        currentRun > 0 &&
        (longestRunPrints === undefined ||
          currentRunPrints < longestRunPrints) &&
        currentRunStartMillis !== undefined
      ) {
        longestRunPrints = currentRunPrints
        longestLowRunRangeByCopierName.set(copier.copierName, [
          currentRunStartMillis,
          timeMillis
        ])
      }
    }

    longestLowRunByCopierName.set(copier.copierName, longestRun)
    longestLowRunPrintsByCopierName.set(
      copier.copierName,
      longestRunPrints ?? 0
    )
    lowPrintHoursByCopierName.set(copier.copierName, lowPrintHours)
  }

  const longestLowRun = Math.max(...longestLowRunByCopierName.values(), 0)
  const longestLowCopierNames =
    longestLowRun > 0
      ? getWinningCopierNames(
          [...longestLowRunByCopierName.entries()]
            .filter(([, run]) => run === longestLowRun)
            .map(([copierName]) => copierName),
          false
        )
      : []

  const longestLowCopierStats = longestLowCopierNames.flatMap((copierName) => {
    const longestRunRange = longestLowRunRangeByCopierName.get(copierName)

    if (longestRunRange === undefined) {
      return []
    }

    return [
      {
        copierName,
        prints: longestLowRunPrintsByCopierName.get(copierName) ?? 0,
        startTimeMillis: longestRunRange[0],
        endTimeMillis: longestRunRange[1]
      }
    ]
  })
  const mostLowPrintHours = Math.max(...lowPrintHoursByCopierName.values(), 0)
  const mostLowPrintHourCopierNames =
    mostLowPrintHours > 0
      ? // Show all copiers tied on low-print hour counts.
        [...lowPrintHoursByCopierName.entries()]
          .filter(([, hourCount]) => hourCount === mostLowPrintHours)
          .map(([copierName]) => copierName)
          .toSorted((nameA, nameB) => nameA.localeCompare(nameB))
      : []

  return {
    busiestHour:
      busiestHourTime === undefined
        ? undefined
        : { timeMillis: busiestHourTime, totalPrints: busiestHourTotal },

    busiestHourRunnerUps: topBusiestHours.slice(1),

    busiestCopierHour,

    busiestCopierHourRunnerUps: topBusiestCopierHours.slice(1),

    mostConsecutiveTopCopier: topConsecutiveTopCopierResults[0],

    mostConsecutiveTopCopierRunnerUps: topConsecutiveTopCopierResults.slice(1),

    mostConsecutiveActiveHours: topConsecutiveActiveHoursResults[0],

    mostConsecutiveActiveHoursRunnerUps:
      topConsecutiveActiveHoursResults.slice(1),

    mostConsecutiveLowPrint:
      longestLowCopierStats.length > 0 && longestLowRun > 1
        ? { copierStats: longestLowCopierStats, hours: longestLowRun }
        : undefined,

    mostHoursLowPrintOverall:
      mostLowPrintHourCopierNames.length > 0
        ? { copierNames: mostLowPrintHourCopierNames, hours: mostLowPrintHours }
        : undefined
  }
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

  const selectAllCopiersElement = document.querySelector('#selectAllCopiers')
  const deselectAllCopiersElement = document.querySelector(
    '#deselectAllCopiers'
  )
  const resetCopierSelectionElement = document.querySelector(
    '#resetCopierSelection'
  )

  if (
    !(selectAllCopiersElement instanceof HTMLButtonElement) ||
    !(deselectAllCopiersElement instanceof HTMLButtonElement) ||
    !(resetCopierSelectionElement instanceof HTMLButtonElement)
  ) {
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
      (Number.isFinite(selectedDurationDays) ? selectedDurationDays : 60) *
        DAY_MILLIS

    const useDailyCounts =
      selectedDurationDays === 30 || selectedDurationDays === 60
    const shadedTimeRanges = buildShadedTimeRanges(
      cutoffMillis,
      nowMillis,
      useDailyCounts,
      dashboardData.holidayDayStartMillis
    )

    const selectedCopierIds = [
      ...document.querySelectorAll<HTMLInputElement>(
        '.js-copier-checkbox:checked'
      )
    ].map((checkboxElement) => Number(checkboxElement.value))

    const selectedCopiers = selectedCopierIds
      .map((copierId) => copierDataById.get(copierId))
      .filter((copier): copier is DashboardCopier => copier !== undefined)

    chart.clear()

    const baseSeries: DashboardChartSeries[] = selectedCopiers.map(
      (copier) => ({
        name: copier.copierName,
        type: 'line',
        showSymbol: false,
        ...(isStackedChart ? { stack: 'total', areaStyle: {} } : {}),
        data: useDailyCounts
          ? buildDailyDeltaSeries(copier.hourlyCounts).filter(
              ([timeMillis]) => timeMillis >= cutoffMillis
            )
          : buildHourlyDeltaSeries(copier.hourlyCounts).filter(
              ([timeMillis]) => timeMillis >= cutoffMillis
            )
      })
    )
    const series = isStackedChart
      ? buildPaddedStackedSeries(
          baseSeries,
          cutoffMillis,
          nowMillis,
          useDailyCounts
        )
      : baseSeries

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

        formatter: (
          tooltipItems: Array<{
            axisValue: number
            marker: string
            seriesName: string
            value: [number, number]
          }>
        ) => {
          if (tooltipItems.length === 0) {
            return ''
          }

          const showOnlyNonZeroCopiersInTooltip =
            selectedCopiers.length > DEFAULT_SELECTED_COPIER_COUNT
          const printCountBySeries = tooltipItems.map((point) => ({
            ...point,
            printCount: point.value[1]
          }))
          const visiblePrintCountBySeries = showOnlyNonZeroCopiersInTooltip
            ? printCountBySeries.filter((point) => point.printCount > 0)
            : printCountBySeries
          const totalPrintCount = printCountBySeries.reduce(
            (total, point) => total + point.printCount,
            0
          )
          const topSeriesPrintCount = visiblePrintCountBySeries.reduce(
            (topPrintCount, point) => Math.max(topPrintCount, point.printCount),
            0
          )
          const totalPrintLabel = totalPrintCount === 1 ? 'print' : 'prints'
          const timeHeader = useDailyCounts
            ? new Date(tooltipItems[0].axisValue).toLocaleDateString()
            : formatTooltipDateTime(new Date(tooltipItems[0].axisValue))

          return /* html */ `
            <div style="font-size: 0.8em">
              ${[
                `${timeHeader} · Total: ${totalPrintCount.toLocaleString()} ${totalPrintLabel}`,
                ...visiblePrintCountBySeries.map((point) => {
                  const pointLine = `${point.marker} ${point.seriesName}: ${point.printCount.toLocaleString()}`

                  return topSeriesPrintCount > 0 &&
                    point.printCount === topSeriesPrintCount
                    ? `<strong>${pointLine}</strong>`
                    : pointLine
                })
              ].join('<br/>')}
            </div>
          `
        }
      },

      legend: {
        type: 'scroll',
        selectedMode: false
      },

      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },

          myStackedChart: {
            show: true,
            title: isStackedChart
              ? 'Disable stacked chart'
              : 'Enable stacked chart',
            icon: STACKED_TOOLBOX_ICON_PATH,
            onclick: () => {
              isStackedChart = !isStackedChart
              updateChart()
            }
          },

          myExportCsv: {
            show: true,
            title: 'Export Data as CSV',
            icon: CSV_TOOLBOX_ICON_PATH,
            onclick: () => {
              exportCsvData()
            }
          }
        },
        itemGap: 20
      },

      dataZoom: [
        {
          type: 'inside'
        }
      ],

      xAxis: {
        type: 'time',
        min: cutoffMillis,
        max: nowMillis,

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

      grid: {
        left: '1%',
        right: '1%',
        containLabel: true
      },

      series
    })
  }

  chart.on('datazoom', () => {
    chart.dispatchAction({ type: 'hideTip' })
  })

  const checkboxElements = document.querySelectorAll<HTMLInputElement>(
    '.js-copier-checkbox'
  )
  const copierSelectionElement = document.querySelector('#copierSelection')
  const copierFilterElement = document.querySelector('#copierNameFilter')
  const copierOptionElements =
    document.querySelectorAll<HTMLDivElement>('.js-copier-option')
  let showHiddenCopiers = false
  let isStackedChart = false
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

  const getPrintCountByCopier = (
    cutoffMillis: number
  ): Array<{
    copierId: number
    copierName: string
    printCount: number
  }> =>
    dashboardData.copiers.map((copier) => ({
      copierId: copier.copierId,
      copierName: copier.copierName,
      printCount: getPrintCountInRange(copier, cutoffMillis)
    }))

  const getDefaultSelectedCopierIds = (): Set<number> => {
    const { cutoffMillis } = getDurationRange()

    return new Set(
      getPrintCountByCopier(cutoffMillis)
        .toSorted((copierA, copierB) => {
          if (copierB.printCount !== copierA.printCount) {
            return copierB.printCount - copierA.printCount
          }

          return copierA.copierName.localeCompare(copierB.copierName)
        })
        .slice(0, DEFAULT_SELECTED_COPIER_COUNT)
        .map((copier) => copier.copierId)
    )
  }

  const getSelectedCopierIds = (): Set<number> =>
    new Set(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '.js-copier-checkbox:checked'
        )
      ].map((checkboxElement) => Number(checkboxElement.value))
    )

  const applySelectedCopierIds = (selectedCopierIds: Set<number>): void => {
    for (const checkboxElement of checkboxElements) {
      checkboxElement.checked = selectedCopierIds.has(
        Number(checkboxElement.value)
      )
    }
  }

  const loadSelectedCopierIds = (): Set<number> | undefined => {
    try {
      const storedValue = globalThis.localStorage.getItem(
        SELECTED_COPIER_IDS_STORAGE_KEY
      )

      if (storedValue === null || storedValue === '') {
        return
      }

      const storedCopierIds = JSON.parse(storedValue) as unknown

      if (!Array.isArray(storedCopierIds)) {
        return
      }

      const selectedCopierIds = storedCopierIds
        .map((value) => Number(value))
        .filter(
          (copierId) =>
            Number.isInteger(copierId) && copierDataById.has(copierId)
        )

      return new Set(selectedCopierIds)
    } catch {
      return
    }
  }

  const storeSelectedCopierIds = (): void => {
    try {
      globalThis.localStorage.setItem(
        SELECTED_COPIER_IDS_STORAGE_KEY,
        JSON.stringify([...getSelectedCopierIds()])
      )
    } catch {
      // localStorage may be blocked by browser settings
    }
  }

  const updateKpis = (): void => {
    const kpiSectionElement = document.querySelector('#kpiSection')

    if (!(kpiSectionElement instanceof HTMLElement)) {
      return
    }

    const { cutoffMillis } = getDurationRange()
    const kpis = computeKpisForRange(dashboardData.copiers, cutoffMillis)

    const selectedDurationDays = Number(chartDurationDaysElement.value)
    const durationLabel =
      dashboardData.durationOptions.find(
        (option) => option.days === selectedDurationDays
      )?.label ?? ''

    const setKpi = (idBase: string, value: string, context: string): void => {
      const valueElement = document.querySelector(`#${idBase}Value`)
      const contextElement = document.querySelector(`#${idBase}Context`)

      if (valueElement instanceof HTMLElement) {
        valueElement.textContent = value
      }

      if (contextElement instanceof HTMLElement) {
        contextElement.textContent = context
      }
    }

    const noDataValue = '—'
    const noDataContext = 'No data available'
    const formatCopierNames = (copierNames: string[]): string =>
      copierNames.join('\n')
    const formatConsecutiveHoursCopierStats = (
      copierStats: Array<{
        copierName: string
        startTimeMillis: number
        endTimeMillis: number
      }>
    ): string =>
      copierStats
        .map(
          (copierStat) =>
            `${copierStat.copierName}\n${formatTooltipDateTime(new Date(copierStat.startTimeMillis))} to ${formatTooltipDateTime(new Date(copierStat.endTimeMillis))}`
        )
        .join('\n')
    const formatPrintCount = (prints: number): string =>
      `${prints.toLocaleString()} prints`
    const formatHourCount = (hours: number): string =>
      `${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`

    const setKpiRunnerUps = (
      containerId: string,
      runnerUps: Array<{ value: string; context: string }>
    ): void => {
      const container = document.querySelector(`#${containerId}`)
      if (!(container instanceof HTMLElement)) return

      const places = ['2nd', '3rd']
      container.innerHTML = runnerUps
        .slice(0, 2)
        .map((runnerUp, index) => {
          const escapedValue = runnerUp.value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
          const escapedContext = runnerUp.context
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
          return `<div class="kpi-runner-up-item"><span class="kpi-runner-up-label">${places[index]}</span><br /><span class="kpi-runner-up-value">${escapedValue}</span><br /><span class="kpi-runner-up-context">${escapedContext}</span></div>`
        })
        .join('')
    }

    if (kpis.busiestHour === undefined) {
      setKpi('kpiBusiestHour', noDataValue, noDataContext)
      setKpiRunnerUps('kpiBusiestHourRunnerUps', [])
    } else {
      setKpi(
        'kpiBusiestHour',
        formatPrintCount(kpis.busiestHour.totalPrints),
        formatTooltipDateTime(new Date(kpis.busiestHour.timeMillis))
      )
      setKpiRunnerUps(
        'kpiBusiestHourRunnerUps',
        kpis.busiestHourRunnerUps.map((h) => ({
          value: formatPrintCount(h.totalPrints),
          context: formatTooltipDateTime(new Date(h.timeMillis))
        }))
      )
    }

    if (kpis.busiestCopierHour === undefined) {
      setKpi('kpiBusiestCopierHour', noDataValue, noDataContext)
      setKpiRunnerUps('kpiBusiestCopierHourRunnerUps', [])
    } else {
      const firstCopierHour = kpis.busiestCopierHour.copierHours[0]

      if (firstCopierHour === undefined) {
        setKpi('kpiBusiestCopierHour', noDataValue, noDataContext)
        setKpiRunnerUps('kpiBusiestCopierHourRunnerUps', [])
      } else {
        setKpi(
          'kpiBusiestCopierHour',
          formatPrintCount(kpis.busiestCopierHour.prints),
          kpis.busiestCopierHour.copierHours
            .map(
              (copierHour) =>
                `${copierHour.copierName}\n${formatTooltipDateTime(new Date(copierHour.timeMillis))}`
            )
            .join('\n')
        )
        setKpiRunnerUps(
          'kpiBusiestCopierHourRunnerUps',
          kpis.busiestCopierHourRunnerUps
            .filter((r) => r.copierHours.length > 0)
            .map((r) => ({
              value: formatPrintCount(r.prints),
              context: r.copierHours
                .map(
                  (ch) =>
                    `${ch.copierName}\n${formatTooltipDateTime(new Date(ch.timeMillis))}`
                )
                .join('\n')
            }))
        )
      }
    }

    if (kpis.mostConsecutiveTopCopier === undefined) {
      setKpi('kpiTopCopierStreak', noDataValue, noDataContext)
      setKpiRunnerUps('kpiTopCopierStreakRunnerUps', [])
    } else {
      setKpi(
        'kpiTopCopierStreak',
        formatHourCount(kpis.mostConsecutiveTopCopier.hours),
        formatConsecutiveHoursCopierStats(
          kpis.mostConsecutiveTopCopier.copierStats
        )
      )
      setKpiRunnerUps(
        'kpiTopCopierStreakRunnerUps',
        kpis.mostConsecutiveTopCopierRunnerUps
          .filter((r) => r.copierStats.length > 0)
          .map((r) => ({
            value: formatHourCount(r.hours),
            context: formatConsecutiveHoursCopierStats(r.copierStats)
          }))
      )
    }

    if (kpis.mostConsecutiveActiveHours === undefined) {
      setKpi('kpiActiveStreak', noDataValue, noDataContext)
      setKpiRunnerUps('kpiActiveStreakRunnerUps', [])
    } else {
      setKpi(
        'kpiActiveStreak',
        formatHourCount(kpis.mostConsecutiveActiveHours.hours),
        formatConsecutiveHoursCopierStats(
          kpis.mostConsecutiveActiveHours.copierStats
        )
      )
      setKpiRunnerUps(
        'kpiActiveStreakRunnerUps',
        kpis.mostConsecutiveActiveHoursRunnerUps
          .filter((r) => r.copierStats.length > 0)
          .map((r) => ({
            value: formatHourCount(r.hours),
            context: formatConsecutiveHoursCopierStats(r.copierStats)
          }))
      )
    }

    if (kpis.mostHoursLowPrintOverall === undefined) {
      setKpi('kpiLowPrintHours', noDataValue, noDataContext)
    } else {
      setKpi(
        'kpiLowPrintHours',
        formatHourCount(kpis.mostHoursLowPrintOverall.hours),
        formatCopierNames(kpis.mostHoursLowPrintOverall.copierNames)
      )
    }

    const totalPrints = dashboardData.copiers.reduce(
      (total, copier) => total + getPrintCountInRange(copier, cutoffMillis),
      0
    )

    const actualDataStartMillis = getActualDataStartMillis(
      dashboardData.copiers
    )
    const expectedDataEndMillis = getExpectedDataEndMillis()
    const copiersWithIncompleteRangeCount = dashboardData.copiers.filter(
      (copier) => {
        const copierDataRange = getCopierDataRange(copier)

        return (
          copierDataRange === undefined ||
          copierDataRange.startMillis > cutoffMillis ||
          copierDataRange.endMillis < expectedDataEndMillis
        )
      }
    ).length
    const totalPrintsContextLines = [durationLabel]

    if (copiersWithIncompleteRangeCount > 0) {
      totalPrintsContextLines.push(
        `${copiersWithIncompleteRangeCount.toLocaleString()} copier${copiersWithIncompleteRangeCount === 1 ? '' : 's'} do not have a full data set for this range`
      )
    }

    if (
      actualDataStartMillis !== undefined &&
      actualDataStartMillis > cutoffMillis
    ) {
      totalPrintsContextLines.push(
        `Data available from ${formatShortDate(actualDataStartMillis)}`
      )
    }

    const totalPrintsContext = totalPrintsContextLines.join('\n')

    setKpi('kpiTotalPrints', formatPrintCount(totalPrints), totalPrintsContext)

    const totalPrintsImpact = calculateEstimatedPaperImpact(totalPrints)
    const estimatedPagesElement = document.querySelector(
      '#kpiEstimatedPagesValue'
    )
    const estimatedReamsElement = document.querySelector(
      '#kpiEstimatedReamsValue'
    )
    const estimatedCartonsElement = document.querySelector(
      '#kpiEstimatedCartonsValue'
    )
    const estimatedTreesElement = document.querySelector(
      '#kpiEstimatedTreesValue'
    )

    if (estimatedPagesElement instanceof HTMLElement) {
      estimatedPagesElement.textContent = formatEstimate(
        totalPrintsImpact.estimatedPages
      )
    }

    if (estimatedReamsElement instanceof HTMLElement) {
      estimatedReamsElement.textContent = formatFractionalEstimate(
        totalPrintsImpact.estimatedReams
      )
    }

    if (estimatedCartonsElement instanceof HTMLElement) {
      estimatedCartonsElement.textContent = formatFractionalEstimate(
        totalPrintsImpact.estimatedCartons
      )
    }

    if (estimatedTreesElement instanceof HTMLElement) {
      estimatedTreesElement.textContent = formatFractionalEstimate(
        totalPrintsImpact.estimatedTrees
      )
    }
  }

  const getPrintCountInRange = (
    copier: DashboardCopier,
    cutoffMillis: number
  ): number =>
    buildHourlyDeltaSeries(copier.hourlyCounts)
      .filter(([timeMillis]) => timeMillis >= cutoffMillis)
      .reduce((total, [, printCount]) => total + printCount, 0)

  const getCopierDataRange = (
    copier: DashboardCopier
  ):
    | {
        startMillis: number
        endMillis: number
      }
    | undefined => {
    if (copier.hourlyCounts.length === 0) {
      return
    }

    let startMillis = copier.hourlyCounts[0].timeMillis
    let endMillis = startMillis

    for (const hourlyCount of copier.hourlyCounts.slice(1)) {
      if (hourlyCount.timeMillis < startMillis) {
        startMillis = hourlyCount.timeMillis
      }

      if (hourlyCount.timeMillis > endMillis) {
        endMillis = hourlyCount.timeMillis
      }
    }

    return {
      startMillis,
      endMillis
    }
  }

  const getExpectedDataEndMillis = (): number =>
    normalizeToHour(Date.now() - HOUR_MILLIS)

  const updateCopierRangeWarning = (
    copierOptionElement: HTMLDivElement,
    copier: DashboardCopier,
    cutoffMillis: number,
    expectedDataEndMillis: number
  ): void => {
    const rangeWarningElement = copierOptionElement.querySelector(
      '.js-copier-range-warning'
    )

    if (!(rangeWarningElement instanceof HTMLSpanElement)) {
      return
    }

    const copierDataRange = getCopierDataRange(copier)

    if (copierDataRange === undefined) {
      rangeWarningElement.classList.add('is-hidden')
      rangeWarningElement.hidden = true
      rangeWarningElement.removeAttribute('title')
      return
    }

    const hasFullRange =
      copierDataRange.startMillis <= cutoffMillis &&
      copierDataRange.endMillis >= expectedDataEndMillis

    if (hasFullRange) {
      rangeWarningElement.classList.add('is-hidden')
      rangeWarningElement.hidden = true
      rangeWarningElement.removeAttribute('title')
      return
    }

    rangeWarningElement.classList.remove('is-hidden')
    rangeWarningElement.hidden = false
    rangeWarningElement.title =
      `Data available: ${formatTooltipDateTime(new Date(copierDataRange.startMillis))}` +
      ` to ${formatTooltipDateTime(new Date(copierDataRange.endMillis))}`
  }

  const getCopierTierIndex = (
    printCount: number,
    totalPrintCount: number
  ): number => {
    if (totalPrintCount <= 0) {
      return 2
    }

    const printShare = Math.max(0, printCount) / totalPrintCount

    if (printShare > HIGH_USAGE_PRINT_SHARE_THRESHOLD) {
      return 0
    }

    if (printShare < LOW_USAGE_PRINT_SHARE_THRESHOLD) {
      return 2
    }

    return 1
  }

  const updateCopierOptionTier = (
    copierOptionElement: HTMLDivElement,
    printCount: number,
    totalPrintCount: number
  ): void => {
    const tierIndex = getCopierTierIndex(printCount, totalPrintCount)
    const tierLabel = COPIER_TIER_LABELS[tierIndex]
    const labelElement = copierOptionElement.querySelector('label')

    if (labelElement instanceof HTMLLabelElement) {
      labelElement.classList.remove(...COPIER_BAND_CLASSES)
      labelElement.classList.add(COPIER_BAND_CLASSES[tierIndex])
    }

    const tierIconElement = copierOptionElement.querySelector('.icon')

    if (tierIconElement instanceof HTMLSpanElement) {
      tierIconElement.setAttribute('title', tierLabel)
    }

    const tierLayersElement = copierOptionElement.querySelector('.fa-layers')

    if (tierLayersElement instanceof HTMLSpanElement) {
      tierLayersElement.classList.remove(...COPIER_ICON_CLASSES)
      tierLayersElement.classList.add(COPIER_ICON_CLASSES[tierIndex])
    }

    const tierLabelElement = copierOptionElement.querySelector('.is-sr-only')

    if (tierLabelElement instanceof HTMLSpanElement) {
      tierLabelElement.textContent = tierLabel
    }
  }

  const reorderCopierOptionsForDuration = (
    copierCounts: Array<{
      copierId: number
      copierName: string
      printCount: number
    }>
  ): void => {
    if (!(copierSelectionElement instanceof HTMLDivElement)) {
      return
    }

    const sortedCopierCounts = copierCounts.toSorted((copierA, copierB) => {
      if (copierB.printCount !== copierA.printCount) {
        return copierB.printCount - copierA.printCount
      }

      return copierA.copierName.localeCompare(copierB.copierName)
    })
    const totalPrintCount = sortedCopierCounts.reduce(
      (runningTotal, copierCount) => runningTotal + copierCount.printCount,
      0
    )

    const sortedCopierIds = sortedCopierCounts.map(
      (copierCount) => copierCount.copierId
    )
    const currentCopierIds = [
      ...copierSelectionElement.querySelectorAll<HTMLInputElement>(
        '.js-copier-checkbox'
      )
    ].map((checkboxElement) => Number(checkboxElement.value))
    const orderMatches =
      currentCopierIds.length === sortedCopierIds.length &&
      currentCopierIds.every(
        (copierId, copierIndex) => copierId === sortedCopierIds[copierIndex]
      )

    if (orderMatches) {
      return
    }

    const copierOptionById = new Map<number, HTMLDivElement>()

    for (const copierOptionElement of copierOptionElements) {
      const checkboxElement = copierOptionElement.querySelector(
        '.js-copier-checkbox'
      )

      if (checkboxElement instanceof HTMLInputElement) {
        copierOptionById.set(Number(checkboxElement.value), copierOptionElement)
      }
    }

    for (const sortedCopierCount of sortedCopierCounts) {
      const copierOptionElement = copierOptionById.get(
        sortedCopierCount.copierId
      )

      if (copierOptionElement === undefined) {
        continue
      }

      copierSelectionElement.append(copierOptionElement)

      updateCopierOptionTier(
        copierOptionElement,
        sortedCopierCount.printCount,
        totalPrintCount
      )
    }
  }

  const updateCopierCountsForDuration = (): void => {
    const { cutoffMillis } = getDurationRange()
    const expectedDataEndMillis = getExpectedDataEndMillis()
    const copierCounts = getPrintCountByCopier(cutoffMillis)

    for (const copierCount of copierCounts) {
      const checkboxElement = document.querySelector<HTMLInputElement>(
        `.js-copier-checkbox[value="${copierCount.copierId}"]`
      )
      const copierOptionElement = checkboxElement?.closest('.js-copier-option')
      const countElement =
        copierOptionElement?.querySelector<HTMLSpanElement>('.js-copier-count')

      if (countElement instanceof HTMLSpanElement) {
        countElement.textContent = copierCount.printCount.toLocaleString()
      }

      if (copierOptionElement instanceof HTMLDivElement) {
        const copier = copierDataById.get(copierCount.copierId)

        if (copier !== undefined) {
          updateCopierRangeWarning(
            copierOptionElement,
            copier,
            cutoffMillis,
            expectedDataEndMillis
          )
        }
      }
    }

    reorderCopierOptionsForDuration(copierCounts)
  }

  const updateHiddenCopiersButton = (hiddenCopierCount = 0): void => {
    let buttonText = 'Show hidden copiers'

    if (showHiddenCopiers) {
      buttonText = 'Hide hidden copiers'
    } else if (hiddenCopierCount > 0) {
      buttonText = `Show hidden copiers (${hiddenCopierCount.toLocaleString()})`
    }

    toggleHiddenCopiersElement.textContent = buttonText
    toggleHiddenCopiersElement.setAttribute(
      'aria-pressed',
      showHiddenCopiers ? 'true' : 'false'
    )
  }

  const updateCopierVisibility = (): void => {
    let hiddenCopierCount = 0

    for (const copierOptionElement of copierOptionElements) {
      const checkboxElement = copierOptionElement.querySelector(
        '.js-copier-checkbox'
      )
      const copierName = copierOptionElement.dataset.copierName ?? ''
      const matchesFilter = copierName.includes(copierNameFilterText)
      const isSelected =
        checkboxElement instanceof HTMLInputElement && checkboxElement.checked
      const isHiddenByToggle = !showHiddenCopiers && !isSelected

      if (isHiddenByToggle) {
        hiddenCopierCount += 1
      }

      copierOptionElement.classList.toggle(
        'is-hidden',
        !matchesFilter || isHiddenByToggle
      )
    }

    updateHiddenCopiersButton(hiddenCopierCount)
  }

  for (const checkboxElement of checkboxElements) {
    checkboxElement.addEventListener('change', () => {
      storeSelectedCopierIds()
      updateChart()
      updateCopierVisibility()
      updateKpis()
    })
  }

  chartDurationDaysElement.value = String(dashboardData.defaultDurationDays)
  chartDurationDaysElement.addEventListener('change', () => {
    updateCopierCountsForDuration()
    updateChart()
    updateCopierVisibility()
    updateKpis()
  })

  if (copierFilterElement instanceof HTMLInputElement) {
    copierFilterElement.addEventListener('input', () => {
      copierNameFilterText = copierFilterElement.value.trim().toLowerCase()
      updateCopierVisibility()
    })
  }

  toggleHiddenCopiersElement.addEventListener('click', () => {
    showHiddenCopiers = !showHiddenCopiers
    updateCopierVisibility()
  })

  selectAllCopiersElement.addEventListener('click', () => {
    applySelectedCopierIds(
      new Set(dashboardData.copiers.map((copier) => copier.copierId))
    )
    storeSelectedCopierIds()
    updateChart()
    updateCopierVisibility()
    updateKpis()
  })

  deselectAllCopiersElement.addEventListener('click', () => {
    applySelectedCopierIds(new Set())
    storeSelectedCopierIds()
    updateChart()
    updateCopierVisibility()
    updateKpis()
  })

  resetCopierSelectionElement.addEventListener('click', () => {
    applySelectedCopierIds(getDefaultSelectedCopierIds())
    storeSelectedCopierIds()
    updateChart()
    updateCopierVisibility()
    updateKpis()
  })

  const exportCsvData = (): void => {
    const { cutoffMillis } = getDurationRange()
    const selectedCopierIds = getSelectedCopierIds()
    const selectedCopiers = dashboardData.copiers.filter((copier) =>
      selectedCopierIds.has(copier.copierId)
    )
    const csvRows: string[] = ['copierName,date,time,count']

    const sortedCopiers = selectedCopiers.toSorted((copierA, copierB) =>
      copierA.copierName.localeCompare(copierB.copierName)
    )

    for (const copier of sortedCopiers) {
      const hourlyRows = buildHourlyDeltaSeries(copier.hourlyCounts)
        .filter(([timeMillis]) => timeMillis >= cutoffMillis)
        .toSorted(([timeA], [timeB]) => timeA - timeB)

      for (const [timeMillis, count] of hourlyRows) {
        csvRows.push(
          [
            escapeCsvValue(copier.copierName),
            escapeCsvValue(formatCsvDate(timeMillis)),
            escapeCsvValue(formatCsvTime(timeMillis)),
            escapeCsvValue(count)
          ].join(',')
        )
      }
    }

    const csvBlob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8'
    })
    const csvUrl = URL.createObjectURL(csvBlob)
    const downloadLinkElement = document.createElement('a')

    downloadLinkElement.href = csvUrl
    downloadLinkElement.download = `copier-hourly-data-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`
    downloadLinkElement.style.display = 'none'
    document.body.append(downloadLinkElement)
    downloadLinkElement.click()
    downloadLinkElement.remove()
    URL.revokeObjectURL(csvUrl)
  }

  const aboutModalElement = document.querySelector('#aboutModal')
  const aboutModalCloseElements = document.querySelectorAll(
    '.js-about-modal-close'
  )

  if (aboutModalElement instanceof HTMLDivElement) {
    const aboutVideoElement = aboutModalElement.querySelector('video')

    const openAboutModal = (): void => {
      if (aboutVideoElement instanceof HTMLVideoElement) {
        aboutVideoElement.currentTime = 0
        // void aboutVideoElement.play()
      }

      aboutModalElement.classList.add('is-active')
    }

    const closeAboutModal = (): void => {
      aboutModalElement.classList.remove('is-active')

      if (aboutVideoElement instanceof HTMLVideoElement) {
        aboutVideoElement.pause()
        aboutVideoElement.currentTime = 0
      }
    }

    document.querySelector('#aboutLink')?.addEventListener('click', (event) => {
      event.preventDefault()
      openAboutModal()
    })

    for (const closeElement of aboutModalCloseElements) {
      closeElement.addEventListener('click', closeAboutModal)
    }

    let shouldOpenAboutModal = true

    try {
      shouldOpenAboutModal =
        globalThis.sessionStorage.getItem(SUPPRESS_ABOUT_MODAL_STORAGE_KEY) !==
        'true'
      globalThis.sessionStorage.removeItem(SUPPRESS_ABOUT_MODAL_STORAGE_KEY)
    } catch {
      shouldOpenAboutModal = true
    }

    if (shouldOpenAboutModal) {
      openAboutModal()
    }
  }

  const tipsModalElement = document.querySelector('#tipsModal')
  const tipsModalCloseElements = document.querySelectorAll(
    '.js-tips-modal-close'
  )

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

  updateCopierCountsForDuration()

  const storedSelectedCopierIds = loadSelectedCopierIds()
  applySelectedCopierIds(
    storedSelectedCopierIds ?? getDefaultSelectedCopierIds()
  )

  updateChart()
  updateCopierVisibility()
  updateKpis()

  window.addEventListener('resize', () => {
    chart.resize()
  })

  const REFRESH_TOAST_TIMEOUT_MILLIS = 20 * 60 * 1000

  const refreshToastElement = document.querySelector('#refreshToast')

  if (refreshToastElement instanceof HTMLElement) {
    setTimeout(() => {
      refreshToastElement.hidden = false
    }, REFRESH_TOAST_TIMEOUT_MILLIS)

    document
      .querySelector('#refreshToastDismiss')
      ?.addEventListener('click', () => {
        refreshToastElement.hidden = true
      })

    document
      .querySelector('#refreshToastRefresh')
      ?.addEventListener('click', () => {
        try {
          globalThis.sessionStorage.setItem(
            SUPPRESS_ABOUT_MODAL_STORAGE_KEY,
            'true'
          )
        } catch {
          // sessionStorage may be blocked by browser settings
        }

        location.reload()
      })
  }
})()
