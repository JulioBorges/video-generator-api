import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";

let _db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (_db) return _db;

  fs.ensureDirSync(path.dirname(dbPath));
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  logger.info({ dbPath }, "SQLite database initialized");
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'queued',
      progress     INTEGER NOT NULL DEFAULT 0,
      stage        TEXT,
      input_data   TEXT NOT NULL,
      output_path  TEXT,
      error        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  `);
}
