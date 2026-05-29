import sqlite from 'better-sqlite3';
import { copierDB } from '../helpers/database.helpers.js';
const createStatements = [
    `
    CREATE TABLE IF NOT EXISTS Copiers (
      copierId INTEGER PRIMARY KEY AUTOINCREMENT,
      copierName TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      oid TEXT,
      isActive INTEGER NOT NULL DEFAULT 1
    );
  `,
    `
    CREATE TABLE IF NOT EXISTS CopierCounts (
      countId INTEGER PRIMARY KEY AUTOINCREMENT,
      copierId INTEGER NOT NULL,
      timeMillis INTEGER NOT NULL,
      countType TEXT NOT NULL,
      countValue INTEGER NOT NULL,
      FOREIGN KEY (copierId) REFERENCES Copiers (copierId)
    );
  `
];
export function initializeDatabase() {
    const database = sqlite(copierDB);
    for (const createStatement of createStatements) {
        database.exec(createStatement);
    }
    database.close();
}
