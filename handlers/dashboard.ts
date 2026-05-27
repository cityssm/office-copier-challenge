import type { Request, Response } from 'express'

import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js'
import getCopiers from '../database/getCopiers.js'
import { getConfigProperty } from '../helpers/config.helpers.js'

const DEFAULT_COPIER_COUNT = 9
const HOUR_MILLIS = 60 * 60 * 1000
const DAY_MILLIS = 24 * HOUR_MILLIS
const MAX_DAYS = 60

const DURATION_PRESETS = [
  {
    days: 1,
    label: 'Past 24 Hours'
  },
  {
    days: 7,
    label: 'Past 7 Days'
  },
  {
    days: 30,
    label: 'Past 30 Days'
  },
  {
    days: 60,
    label: 'Past 60 Days'
  }
] as const

interface DashboardPoint {
  timeMillis: number
  countValue: number
}

interface DashboardDurationOption {
  days: number
  label: string
}

interface DashboardCopierData {
  copierId: number
  copierName: string
  hourlyCounts: DashboardPoint[]
  totalPrints: number
}

function getHourlyMaximumValues(hourlyCounts: DashboardPoint[]): DashboardPoint[] {
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

  return [...maximumCountByHour.entries()]
    .toSorted(([hourA], [hourB]) => hourA - hourB)
    .map(([timeMillis, countValue]) => ({ timeMillis, countValue }))
}

function normalizeToHour(timeMillis: number): number {
  return Math.floor(timeMillis / HOUR_MILLIS) * HOUR_MILLIS
}

function compareByMostPrints(
  copierA: DashboardCopierData,
  copierB: DashboardCopierData
): number {
  if (copierB.totalPrints !== copierA.totalPrints) {
    return copierB.totalPrints - copierA.totalPrints
  }

  return copierA.copierName.localeCompare(copierB.copierName)
}

function getTotalPrints(hourlyCounts: DashboardPoint[]): number {
  let previousCountValue: number | undefined
  let totalPrints = 0

  for (const hourlyCount of hourlyCounts) {
    if (previousCountValue !== undefined) {
      totalPrints += Math.max(0, hourlyCount.countValue - previousCountValue)
    }

    previousCountValue = hourlyCount.countValue
  }

  return totalPrints
}

export default function handler(_request: Request, response: Response): void {
  const hourlyMaximums = getCopierHourlyMaximums()
  const activeCopiers = getCopiers()

  const copiersById = new Map<number, DashboardCopierData>()

  for (const copier of activeCopiers) {
    copiersById.set(copier.copierId, {
      copierId: copier.copierId,
      copierName: copier.copierName,
      hourlyCounts: [],
      totalPrints: 0
    })
  }

  for (const hourlyMaximum of hourlyMaximums) {
    const copierData = copiersById.get(hourlyMaximum.copierId)

    if (copierData !== undefined) {
      copierData.hourlyCounts.push({
        timeMillis: normalizeToHour(hourlyMaximum.hourStartMillis),
        countValue: hourlyMaximum.countValue
      })
    }
  }

  const copierData = [...copiersById.values()]

  for (const copier of copierData) {
    copier.hourlyCounts = getHourlyMaximumValues(copier.hourlyCounts)
    copier.totalPrints = getTotalPrints(copier.hourlyCounts)
  }

  const sortedByMostUsed = copierData.toSorted(compareByMostPrints)
  const nowMillis = Date.now()
  const durationOptions = DURATION_PRESETS.filter((durationPreset) => {
    if (durationPreset.days === 30 || durationPreset.days === 60) {
      return hourlyMaximums.some(
        (hourlyMaximum) =>
          hourlyMaximum.hourStartMillis <=
          nowMillis - durationPreset.days * DAY_MILLIS
      )
    }

    return hourlyMaximums.some(
      (hourlyMaximum) =>
        hourlyMaximum.hourStartMillis >=
        nowMillis - durationPreset.days * DAY_MILLIS
    )
  }) as DashboardDurationOption[]

  const defaultDurationDays = durationOptions.some((o) => o.days === 7)
    ? 7
    : durationOptions.length > 0
      ? durationOptions[0].days
      : MAX_DAYS

  const defaultDurationLabel =
    durationOptions.find((durationOption) => durationOption.days === defaultDurationDays)
      ?.label ?? 'Past 60 Days'

  const defaultCopierIds = sortedByMostUsed
    .slice(0, DEFAULT_COPIER_COUNT)
    .map((copier) => copier.copierId)

  const dashboardData = {
    copiers: sortedByMostUsed,
    defaultCopierIds,
    defaultDurationDays,
    durationOptions
  }

  response.render('dashboard', {
    dashboardData,
    dashboardDataJson: JSON.stringify(dashboardData).replaceAll(
      '</',
      String.raw`<\/`
    ),
    durationLabel: defaultDurationLabel,
    headTitle: getConfigProperty('application.applicationName')
  })
}
