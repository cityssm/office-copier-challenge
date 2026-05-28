import { millisecondsInOneHour } from '@cityssm/to-millis'
import sqlite from 'better-sqlite3'

import { copierDB } from '../helpers/database.helpers.js'

export default function purgeCopierCountsByHour(): number {
  const database = sqlite(copierDB)

  const result = database
    .prepare(/* sql */ `
      DELETE FROM CopierCounts
      WHERE
        countId IN (
          SELECT
            countId
          FROM
            (
              SELECT
                countId,
                ROW_NUMBER() OVER (
                  PARTITION BY
                    copierId,
                    (timeMillis / @hourMillis)
                  ORDER BY
                    countValue DESC,
                    timeMillis DESC,
                    countId DESC
                ) AS rowNum
              FROM
                CopierCounts
            )
          WHERE
            rowNum > 1
        )
    `)
    .run({
      hourMillis: millisecondsInOneHour
    })

  database.close()

  return result.changes
}
