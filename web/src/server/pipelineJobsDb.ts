import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { withDb } from '@/server/db';
import type { PipelineJob } from '@/types/api';

const LOG_MAX = 256_000;
const LOG_TRIM = 200_000;

export function hashConfig(configPath: string | null): string | null {
  if (!configPath) return null;
  return createHash('sha256').update(configPath).digest('hex').slice(0, 16);
}

export async function insertPipelineJob(
  id: string,
  jobType: string,
  propertyId: number | null,
  configHash: string | null,
): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO pipeline_jobs (id, job_type, status, property_id, config_hash)
       VALUES ($1::uuid, $2, 'running', $3, $4)`,
      [id, jobType, propertyId, configHash],
    );
  });
}

export async function appendPipelineJobLog(id: string, chunk: string): Promise<void> {
  await withDb(async (client) => {
    const cur = await client.query<{ log_text: string }>(
      `SELECT log_text FROM pipeline_jobs WHERE id = $1::uuid FOR UPDATE`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) return;
    let log = (row.log_text || '') + chunk;
    if (log.length > LOG_MAX) log = log.slice(-LOG_TRIM);
    await client.query(`UPDATE pipeline_jobs SET log_text = $2 WHERE id = $1::uuid`, [id, log]);
  });
}

export async function cancelPipelineJobInDb(
  id: string,
  message = 'Cancelled by user',
): Promise<boolean> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `UPDATE pipeline_jobs
       SET status = 'error',
           error_text = $2,
           exit_code = -1,
           finished_at = now()
       WHERE id = $1::uuid AND status = 'running'
       RETURNING id::text`,
      [id, message],
    );
    return (cur.rowCount ?? 0) > 0;
  });
}

export async function finishPipelineJob(
  id: string,
  status: 'success' | 'error',
  exitCode: number | null,
  error?: string,
): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE pipeline_jobs
       SET status = $2, exit_code = $3, error_text = $4, finished_at = now()
       WHERE id = $1::uuid`,
      [id, status, exitCode, error ?? null],
    );
  });
}

export async function getPipelineJobFromDb(id: string): Promise<PipelineJob | null> {
  return withDb(async (client) => {
    const cur = await client.query<{
      status: string;
      exit_code: number | null;
      log_text: string;
      error_text: string | null;
    }>(
      `SELECT status, exit_code, log_text, error_text FROM pipeline_jobs WHERE id = $1::uuid`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) return null;
    const st = row.status === 'success' ? 'success' : row.status === 'running' ? 'running' : 'error';
    return {
      status: st,
      exitCode: row.exit_code,
      log: row.log_text || '',
      error: row.error_text || undefined,
    };
  });
}

export async function isAnyPipelineJobRunning(): Promise<boolean> {
  return withDb(async (client) => {
    const cur = await client.query(`SELECT 1 FROM pipeline_jobs WHERE status = 'running' LIMIT 1`);
    return cur.rows.length > 0;
  });
}

export interface PipelineJobListItem {
  id: string;
  jobType: string;
  status: 'running' | 'success' | 'error';
  propertyId: number | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
}

const STALE_JOB_HOURS = Number(process.env.PIPELINE_JOB_STALE_HOURS || '6');

/** Mark jobs stuck in running state as error (e.g. after server restart). */
export async function reconcileStaleRunningJobs(): Promise<number> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `UPDATE pipeline_jobs
       SET status = 'error',
           error_text = COALESCE(error_text, 'Job interrupted (server restart or timeout)'),
           finished_at = now()
       WHERE status = 'running'
         AND started_at < now() - ($1::text || ' hours')::interval
       RETURNING id::text`,
      [String(STALE_JOB_HOURS)],
    );
    return cur.rowCount ?? 0;
  });
}

export async function listRecentPipelineJobs(limit = 20): Promise<PipelineJobListItem[]> {
  return withDb(async (client) => {
    const cur = await client.query<{
      id: string;
      job_type: string;
      status: string;
      property_id: number | null;
      started_at: Date;
      finished_at: Date | null;
      exit_code: number | null;
      error_text: string | null;
    }>(
      `SELECT id::text, job_type, status, property_id, started_at, finished_at, exit_code, error_text
       FROM pipeline_jobs
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit],
    );
    return cur.rows.map((row) => ({
      id: row.id,
      jobType: row.job_type,
      status: row.status === 'success' ? 'success' : row.status === 'running' ? 'running' : 'error',
      propertyId: row.property_id,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      exitCode: row.exit_code,
      error: row.error_text,
    }));
  });
}

export async function getActiveRunningJob(): Promise<PipelineJobListItem | null> {
  return withDb(async (client) => {
    const cur = await client.query<{
      id: string;
      job_type: string;
      status: string;
      property_id: number | null;
      started_at: Date;
      finished_at: Date | null;
      exit_code: number | null;
      error_text: string | null;
    }>(
      `SELECT id::text, job_type, status, property_id, started_at, finished_at, exit_code, error_text
       FROM pipeline_jobs
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    );
    const row = cur.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jobType: row.job_type,
      status: 'running',
      propertyId: row.property_id,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      exitCode: row.exit_code,
      error: row.error_text,
    };
  });
}

export async function writeAuditLog(
  action: string,
  actor: string | null,
  propertyId: number | null,
  detail: Record<string, unknown> | null,
  client?: PoolClient,
): Promise<void> {
  const run = async (c: PoolClient) => {
    await c.query(
      `INSERT INTO audit_log (action, actor, property_id, detail) VALUES ($1, $2, $3, $4)`,
      [action, actor, propertyId, detail ? JSON.stringify(detail) : null],
    );
  };
  if (client) {
    await run(client);
    return;
  }
  await withDb(run);
}
