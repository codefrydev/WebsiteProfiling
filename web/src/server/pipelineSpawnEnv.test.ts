import path from 'path';
import { describe, expect, it } from 'vitest';
import { getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';

describe('getPipelineSpawnEnv', () => {
  const repoRoot = '/tmp/website-profiling';

  it('sets repo paths without WP_PROPERTY_ID for full pipeline runs', () => {
    const env = getPipelineSpawnEnv(repoRoot);
    expect(env.WEBSITE_PROFILING_ROOT).toBe(repoRoot);
    expect(env.PYTHONPATH).toBe(path.join(repoRoot, 'src'));
    expect(env.WP_PROPERTY_ID).toBeUndefined();
    expect(env.WP_SCHEDULED_SPAWN).toBeUndefined();
  });

  it('sets WP_PROPERTY_ID only for property-scoped CLI spawns', () => {
    const env = getPipelineSpawnEnv(repoRoot, 42);
    expect(env.WP_PROPERTY_ID).toBe('42');
    expect(env.WP_SCHEDULED_SPAWN).toBeUndefined();
  });

  it('ignores invalid propertyId', () => {
    const env = getPipelineSpawnEnv(repoRoot, Number.NaN);
    expect(env.WP_PROPERTY_ID).toBeUndefined();
  });
});
