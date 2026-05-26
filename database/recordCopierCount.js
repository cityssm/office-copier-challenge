import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
export default function recordCopierCount(countRecord) {
    const database = sqlite(copierDB);
    database
        .prepare(`
      INSERT INTO
        CopierCounts (copierId, timeMillis, countType, countValue)
      VALUES
        (@copierId, @timeMillis, @countType, @countValue)
    `)
        .run({
        ...countRecord,
        timeMillis: Date.now()
    });
    database.close();
}
