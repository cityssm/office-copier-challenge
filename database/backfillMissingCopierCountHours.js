import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
const HOUR_MILLIS = 60 * 60 * 1000;
export default function backfillMissingCopierCountHours() {
    const database = sqlite(copierDB);
    const hourlyMaximumRows = database
        .prepare(`
      SELECT
        copierId,
        (timeMillis / @hourMillis) * @hourMillis AS hourStartMillis,
        countType,
        countValue
      FROM
        (
          SELECT
            copierId,
            timeMillis,
            countType,
            countValue,
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
        rowNum = 1
      ORDER BY
        copierId,
        hourStartMillis
    `)
        .all({
        hourMillis: HOUR_MILLIS
    });
    const backfillRows = [];
    let previousRow;
    for (const hourlyMaximumRow of hourlyMaximumRows) {
        if (previousRow !== undefined &&
            previousRow.copierId === hourlyMaximumRow.copierId) {
            let missingHourStartMillis = previousRow.hourStartMillis + HOUR_MILLIS;
            while (missingHourStartMillis < hourlyMaximumRow.hourStartMillis) {
                backfillRows.push({
                    copierId: previousRow.copierId,
                    hourStartMillis: missingHourStartMillis,
                    countType: previousRow.countType,
                    countValue: previousRow.countValue
                });
                missingHourStartMillis += HOUR_MILLIS;
            }
        }
        previousRow = hourlyMaximumRow;
    }
    if (backfillRows.length > 0) {
        const insertBackfillStatement = database.prepare(`
      INSERT INTO
        CopierCounts (copierId, timeMillis, countType, countValue)
      VALUES
        (@copierId, @hourStartMillis, @countType, @countValue)
    `);
        const insertBackfillRows = database.transaction((rows) => {
            for (const row of rows) {
                insertBackfillStatement.run(row);
            }
        });
        insertBackfillRows(backfillRows);
    }
    database.close();
    return backfillRows.length;
}
