import { daysToMillis, millisecondsInOneHour } from '@cityssm/to-millis';
import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
const SIXTY_DAYS_MILLIS = daysToMillis(60);
export default function getCopierHourlyMaximums() {
    const database = sqlite(copierDB);
    const result = database
        .prepare(`
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
        hourMillis: millisecondsInOneHour,
        timeMillisCutoff: Date.now() - SIXTY_DAYS_MILLIS
    });
    database.close();
    return result;
}
