import type { Request, Response } from 'express'

import getCopierHourlyMaximums from '../database/getCopierHourlyMaximums.js'
import getCopiers from '../database/getCopiers.js'
import { getConfigProperty } from '../helpers/config.helpers.js'

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

export default function handler(request: Request, response: Response): void {
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
        timeMillis: hourlyMaximum.hourStartMillis,
        countValue: hourlyMaximum.countValue
      })
    }
  }

  const copierData = [...copiersById.values()]

  for (const copier of copierData) {
    copier.totalPrints = getTotalPrints(copier.hourlyCounts)
  }

  const sortedByMostUsed = [...copierData].sort(
    (a, b) => b.totalPrints - a.totalPrints || a.copierName.localeCompare(b.copierName)
  )

  const sortedByLeastUsed = [...copierData].sort(
    (a, b) => a.totalPrints - b.totalPrints || a.copierName.localeCompare(b.copierName)
  )

  const defaultCopierIds = sortedByMostUsed
    .slice(0, 10)
    .map((copier) => copier.copierId)

  const mostUsedCopier = sortedByMostUsed[0]
  const leastUsedCopier = sortedByLeastUsed[0]

  const dashboardData = {
    copiers: copierData,
    defaultCopierIds,
    kpis: {
      mostUsedCopier:
        mostUsedCopier === undefined
          ? null
          : ({
              copierName: mostUsedCopier.copierName,
              totalPrints: mostUsedCopier.totalPrints
            } satisfies DashboardKpi),
      leastUsedCopier:
        leastUsedCopier === undefined
          ? null
          : ({
              copierName: leastUsedCopier.copierName,
              totalPrints: leastUsedCopier.totalPrints
            } satisfies DashboardKpi)
    }
  }

  response.render('dashboard', {
    headTitle: getConfigProperty('application.applicationName'),
    dashboardData,
    dashboardDataJson: JSON.stringify(dashboardData).replaceAll('</', '<\\/')
  })
}
