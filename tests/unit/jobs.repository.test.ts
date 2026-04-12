import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { JobsRepository } from "../../src/db/jobs.repository";

function createInMemoryDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE jobs (
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
  `);
  return db;
}

describe("JobsRepository", () => {
  let repo: JobsRepository;

  beforeEach(() => {
    const db = createInMemoryDb();
    repo = new JobsRepository(db);
  });

  it("creates a new job", () => {
    const job = repo.create("test-id-1", { script: "test" });
    expect(job.id).toBe("test-id-1");
    expect(job.status).toBe("queued");
    expect(job.progress).toBe(0);
  });

  it("finds a job by id", () => {
    repo.create("test-id-2", { script: "hello" });
    const job = repo.findById("test-id-2");
    expect(job).toBeDefined();
    expect(job?.status).toBe("queued");
  });

  it("returns undefined for non-existent job", () => {
    const job = repo.findById("non-existent");
    expect(job).toBeUndefined();
  });

  it("updates job status and progress", () => {
    repo.create("test-id-3", {});
    repo.updateStatus("test-id-3", "processing", 50, "tts_generation");
    const job = repo.findById("test-id-3");
    expect(job?.status).toBe("processing");
    expect(job?.progress).toBe(50);
    expect(job?.stage).toBe("tts_generation");
  });

  it("marks job as ready with output path", () => {
    repo.create("test-id-4", {});
    repo.updateStatus("test-id-4", "ready", 100, "done", "/output/test.mp4");
    const job = repo.findById("test-id-4");
    expect(job?.status).toBe("ready");
    expect(job?.output_path).toBe("/output/test.mp4");
  });

  it("marks job as failed with error message", () => {
    repo.create("test-id-5", {});
    repo.updateStatus("test-id-5", "failed", 0, "error", undefined, "API key invalid");
    const job = repo.findById("test-id-5");
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("API key invalid");
  });

  it("deletes a job", () => {
    repo.create("test-id-6", {});
    const deleted = repo.delete("test-id-6");
    expect(deleted).toBe(true);
    expect(repo.findById("test-id-6")).toBeUndefined();
  });

  it("lists all jobs", () => {
    repo.create("a1", {});
    repo.create("a2", {});
    const jobs = repo.findAll();
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });
});
