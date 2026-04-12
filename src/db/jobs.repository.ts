import Database from "better-sqlite3";
import type { VideoStatus } from "../types/video.types";

export interface JobRecord {
  id: string;
  status: VideoStatus;
  progress: number;
  stage: string | null;
  input_data: string;
  output_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class JobsRepository {
  constructor(private db: Database.Database) {}

  create(id: string, inputData: unknown): JobRecord {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, status, progress, input_data)
      VALUES (?, 'queued', 0, ?)
    `);
    stmt.run(id, JSON.stringify(inputData));
    return this.findById(id)!;
  }

  findById(id: string): JobRecord | undefined {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`);
    return stmt.get(id) as JobRecord | undefined;
  }

  findAll(): JobRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`);
    return stmt.all() as JobRecord[];
  }

  updateStatus(
    id: string,
    status: VideoStatus,
    progress: number,
    stage?: string,
    outputPath?: string,
    error?: string,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = ?, progress = ?, stage = ?, output_path = ?, error = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, progress, stage ?? null, outputPath ?? null, error ?? null, id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM jobs WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
