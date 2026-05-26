import sqlite from 'better-sqlite3'

import { copierDB } from '../helpers/database.helpers.js'

export default function recordCopierCount(countRecord: {
  copierId: number
  countType: string
  countValue: number
}): void {
  const database = sqlite(copierDB)

  database
    .prepare(/* sql */ `
      INSERT INTO
        CopierCounts (copierId, timeMillis, countType, countValue)
      VALUES
        (@copierId, @timeMillis, @countType, @countValue)
    `)
    .run({
      ...countRecord,
      timeMillis: Date.now()
    })

  database.close()
}
