import type { Request, Response } from 'express'

import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js'
import getCopiers from '../database/getCopiers.js'
import { getConfigProperty } from '../helpers/config.helpers.js'

const DEFAULT_COPIER_COUNT = 10
const HOUR_MILLIS = 60 * 60 * 1000

interface DashboardPoint {
  timeMillis: number
  countValue: number
}

interface DashboardCopierData {
  copierId: number
  copierName: string
  hourlyCounts: DashboardPoint[]
  totalPrints: number
}

interface DashboardKpi {
  copierName: string
  totalPrints: number
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

function compareByLeastPrints(
  copierA: DashboardCopierData,
  copierB: DashboardCopierData
): number {
  if (copierA.totalPrints !== copierB.totalPrints) {
    return copierA.totalPrints - copierB.totalPrints
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
    copier.totalPrints = getTotalPrints(copier.hourlyCounts)
  }

  const sortedByMostUsed = copierData.toSorted(compareByMostPrints)
  const sortedByLeastUsed = copierData.toSorted(compareByLeastPrints)

  const defaultCopierIds = sortedByMostUsed
    .slice(0, DEFAULT_COPIER_COUNT)
    .map((copier) => copier.copierId)

  const mostUsedCopier = sortedByMostUsed.at(0)
  const leastUsedCopier = sortedByLeastUsed.at(0)

  const dashboardData = {
    copiers: sortedByMostUsed,
    defaultCopierIds,
    kpis: {
      mostUsedCopier:
        mostUsedCopier === undefined
          ? undefined
          : ({
              copierName: mostUsedCopier.copierName,
              totalPrints: mostUsedCopier.totalPrints
            } satisfies DashboardKpi),
      leastUsedCopier:
        leastUsedCopier === undefined
          ? undefined
          : ({
              copierName: leastUsedCopier.copierName,
              totalPrints: leastUsedCopier.totalPrints
            } satisfies DashboardKpi)
    }
  }

  response.render('dashboard', {
    dashboardData,
    dashboardDataJson: JSON.stringify(dashboardData).replaceAll(
      '</',
      String.raw`<\/`
    ),
    headTitle: getConfigProperty('application.applicationName')
  })
}
