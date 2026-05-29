import sqlite from 'better-sqlite3'

import { copierDB } from '../helpers/database.helpers.js'
import type { Copier } from '../types/record.types.js'

export default function getCopiers(): Copier[] {
  const database = sqlite(copierDB)

  const result = database
    .prepare(/* sql */ `
      SELECT
        copierId,
        copierName,
        ipAddress,
        oid,
        isActive
      FROM
        Copiers
      WHERE
        isActive = 1
    `)
    .all() as Copier[]

  database.close()

  return result
}
