import sqlite from 'better-sqlite3'

import { copierDB } from '../helpers/database.helpers.js'

const HOUR_MILLIS = 60 * 60 * 1000
const SIXTY_DAYS_MILLIS = 60 * 24 * HOUR_MILLIS

export interface CopierHourlyMaximum {
  copierId: number
  copierName: string
  hourStartMillis: number
  countValue: number
}

export default function getCopierHourlyMaximums(): CopierHourlyMaximum[] {
  const database = sqlite(copierDB)

  const result = database
    .prepare(/* sql */ `
      SELECT
        c.copierId,
        c.copierName,
        h.hourStartMillis,
        h.countValue
      FROM
        Copiers c
        INNER JOIN (
          SELECT
            copierId,
            (timeMillis / @hourMillis) * @hourMillis AS hourStartMillis,
            MAX(countValue) AS countValue
          FROM
            CopierCounts
          WHERE
            timeMillis >= @timeMillisCutoff
          GROUP BY
            copierId,
            hourStartMillis
        ) h ON c.copierId = h.copierId
      WHERE
        c.isActive = 1
      ORDER BY
        h.hourStartMillis,
        c.copierName
    `)
    .all({
      hourMillis: HOUR_MILLIS,
      timeMillisCutoff: Date.now() - SIXTY_DAYS_MILLIS
    }) as CopierHourlyMaximum[]

  database.close()

  return result
}
