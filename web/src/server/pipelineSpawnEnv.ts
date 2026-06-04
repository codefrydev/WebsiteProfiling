import path from 'path';
import { getDataDir } from '@/server/db';

export function getRepoRoot(): string {
  return process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');
}

/** Env for spawning `python -m src` so CLI loads config from PostgreSQL. */
export function getPipelineSpawnEnv(
  repoRootOverride?: string,
): NodeJS.ProcessEnv {
  const repoRoot = repoRootOverride || getRepoRoot();
  return {
    ...process.env,
    WEBSITE_PROFILING_ROOT: repoRoot,
    DATA_DIR: getDataDir(),
  };
}
