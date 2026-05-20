import path from 'path';
import { getReportDbPath } from '@/server/pipelineConfig';

export function getRepoRoot() {
  return process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');
}

/** Env for spawning `python -m src` so CLI loads config from report.db. */
export function getPipelineSpawnEnv() {
  const repoRoot = getRepoRoot();
  return {
    ...process.env,
    WEBSITE_PROFILING_ROOT: repoRoot,
    REPORT_DB_PATH: getReportDbPath(),
  };
}
