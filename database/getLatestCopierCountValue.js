import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
export default function getLatestCopierCountValue(countRecord) {
    const database = sqlite(copierDB);
    const result = database
        .prepare(`
      SELECT
        countValue
      FROM
        CopierCounts
      WHERE
        copierId = @copierId
        AND countType = @countType
      ORDER BY
        timeMillis DESC,
        countId DESC
      LIMIT
        1
    `)
        .get(countRecord);
    database.close();
    return result?.countValue;
}
