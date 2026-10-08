import { randomUUID } from 'node:crypto';
import { dbService } from '../database/db.ts';
import { logger } from '../utils/logger.ts';
import type { JobStatus } from '../types/index.ts';

export interface JobDefinition<T = any> {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  payload: T;
  result?: any;
  error?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

type JobHandler<T = any, R = any> = (job: JobDefinition<T>, updateProgress: (pct: number) => void) => Promise<R>;

class JobQueue {
  private handlers = new Map<string, JobHandler>();
  private isProcessing = false;

  public registerHandler<T, R>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler);
  }

  public enqueue<T>(type: string, payload: T): JobDefinition<T> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const payloadStr = JSON.stringify(payload || {});

    dbService.run(
      `INSERT INTO ingestion_jobs (id, type, status, progress, payload_json, result_json, retry_count, created_at)
       VALUES (?, ?, 'QUEUED', 0, ?, '{}', 0, ?)`,
      [id, type, payloadStr, now]
    );

    const job: JobDefinition<T> = {
      id,
      type,
      status: 'QUEUED',
      progress: 0,
      payload,
      retryCount: 0,
      createdAt: now,
    };

    logger.info(`Job enqueued: ${type}`, { jobId: id });
    setTimeout(() => this.processNext(), 50);
    return job;
  }

  public getJob(id: string): JobDefinition | null {
    const row = dbService.get(
      `SELECT * FROM ingestion_jobs WHERE id = ?`,
      [id]
    );
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      status: row.status as JobStatus,
      progress: row.progress,
      payload: JSON.parse(row.payload_json || '{}'),
      result: JSON.parse(row.result_json || '{}'),
      error: row.error,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  public listJobs(limit: number = 50): JobDefinition[] {
    const rows = dbService.all(
      `SELECT * FROM ingestion_jobs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status as JobStatus,
      progress: r.progress,
      payload: JSON.parse(r.payload_json || '{}'),
      result: JSON.parse(r.result_json || '{}'),
      error: r.error,
      retryCount: r.retry_count,
      createdAt: r.created_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    }));
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const nextRow = dbService.get(
        `SELECT * FROM ingestion_jobs WHERE status = 'QUEUED' ORDER BY created_at ASC LIMIT 1`
      );

      if (!nextRow) {
        this.isProcessing = false;
        return;
      }

      const handler = this.handlers.get(nextRow.type);
      const startedAt = new Date().toISOString();

      if (!handler) {
        dbService.run(
          `UPDATE ingestion_jobs SET status = 'FAILED', error = ?, completed_at = ? WHERE id = ?`,
          [`No handler registered for job type: ${nextRow.type}`, startedAt, nextRow.id]
        );
        this.isProcessing = false;
        setTimeout(() => this.processNext(), 50);
        return;
      }

      dbService.run(
        `UPDATE ingestion_jobs SET status = 'PROCESSING', started_at = ? WHERE id = ?`,
        [startedAt, nextRow.id]
      );

      const job: JobDefinition = {
        id: nextRow.id,
        type: nextRow.type,
        status: 'PROCESSING',
        progress: nextRow.progress,
        payload: JSON.parse(nextRow.payload_json || '{}'),
        retryCount: nextRow.retry_count,
        createdAt: nextRow.created_at,
        startedAt,
      };

      const updateProgress = (pct: number) => {
        dbService.run(
          `UPDATE ingestion_jobs SET progress = ? WHERE id = ?`,
          [Math.min(100, Math.max(0, pct)), job.id]
        );
      };

      try {
        const result = await handler(job, updateProgress);
        const completedAt = new Date().toISOString();
        dbService.run(
          `UPDATE ingestion_jobs SET status = 'COMPLETED', progress = 100, result_json = ?, completed_at = ? WHERE id = ?`,
          [JSON.stringify(result || {}), completedAt, job.id]
        );
        logger.info(`Job completed successfully: ${job.type}`, { jobId: job.id });
      } catch (err: any) {
        const failedAt = new Date().toISOString();
        dbService.run(
          `UPDATE ingestion_jobs SET status = 'FAILED', error = ?, completed_at = ? WHERE id = ?`,
          [err.message || 'Unknown processing error', failedAt, job.id]
        );
        logger.error(`Job failed: ${job.type}`, err, { jobId: job.id });
      }
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.processNext(), 50);
    }
  }
}

export const jobQueue = new JobQueue();
