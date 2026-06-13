import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { withDb } from '@/server/db';
import type { PipelineJob } from '@/types/api';

export const PIPELINE_LOG_MAX = 256_000;
export const PIPELINE_LOG_TRIM = 200_000;

const STALE_JOB_HOURS = Number(process.env.PIPELINE_JOB_STALE_HOURS || '1');

export function hashConfig(configPath: string | null): string | null {
  if (!configPath) return null;
  return createHash('sha256').update(configPath).digest('hex').slice(0, 16);
}

function trimPipelineLog(log: string): { log: string; truncated: boolean } {
  if (log.length <= PIPELINE_LOG_MAX) {
    return { log, truncated: false };
  }
  return { log: log.slice(-PIPELINE_LOG_TRIM), truncated: true };
}

async function reconcileStaleRunningJobsWithClient(client: PoolClient): Promise<number> {
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
}

/** Mark jobs stuck in running state as error (e.g. after server restart). */
export async function reconcileStaleRunningJobs(): Promise<number> {
  return withDb(async (client) => reconcileStaleRunningJobsWithClient(client));
}

/**
 * Atomically claim the single running pipeline slot.
 * Reconciles stale jobs in the same transaction before insert.
 */
export async function tryClaimRunningPipelineJob(
  id: string,
  jobType: string,
  propertyId: number | null,
  configHash: string | null,
): Promise<boolean> {
  return withDb(async (client) => {
    await client.query('BEGIN');
    try {
      await reconcileStaleRunningJobsWithClient(client);
      const cur = await client.query<{ id: string }>(
        `INSERT INTO pipeline_jobs (id, job_type, status, property_id, config_hash)
         SELECT $1::uuid, $2, 'running', $3, $4
         WHERE NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE status = 'running')
         RETURNING id::text`,
        [id, jobType, propertyId, configHash],
      );
      await client.query('COMMIT');
      return (cur.rowCount ?? 0) > 0;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}

export async function markRunningJobOrphaned(
  id: string,
  message = 'Job process not found (server restarted)',
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

export async function appendPipelineJobLog(id: string, chunk: string): Promise<boolean> {
  return withDb(async (client) => {
    const cur = await client.query<{ log_text: string; log_truncated: boolean }>(
      `SELECT log_text, log_truncated FROM pipeline_jobs WHERE id = $1::uuid FOR UPDATE`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) return false;
    const combined = (row.log_text || '') + chunk;
    const { log, truncated } = trimPipelineLog(combined);
    const logTruncated = row.log_truncated || truncated;
    await client.query(
      `UPDATE pipeline_jobs SET log_text = $2, log_truncated = $3 WHERE id = $1::uuid`,
      [id, log, logTruncated],
    );
    return logTruncated;
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
  logTruncated?: boolean,
): Promise<void> {
  await withDb(async (client) => {
    if (logTruncated === undefined) {
      await client.query(
        `UPDATE pipeline_jobs
         SET status = $2, exit_code = $3, error_text = $4, finished_at = now()
         WHERE id = $1::uuid`,
        [id, status, exitCode, error ?? null],
      );
      return;
    }
    await client.query(
      `UPDATE pipeline_jobs
       SET status = $2, exit_code = $3, error_text = $4, finished_at = now(), log_truncated = $5
       WHERE id = $1::uuid`,
      [id, status, exitCode, error ?? null, logTruncated],
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
      log_truncated: boolean;
    }>(
      `SELECT status, exit_code, log_text, error_text, log_truncated FROM pipeline_jobs WHERE id = $1::uuid`,
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
      logTruncated: Boolean(row.log_truncated),
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
