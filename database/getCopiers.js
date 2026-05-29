import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
export default function getCopiers() {
    const database = sqlite(copierDB);
    const result = database
        .prepare(`
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
        .all();
    database.close();
    return result;
}
