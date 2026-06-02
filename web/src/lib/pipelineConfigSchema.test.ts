import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ALL_SCHEMA_KEYS } from '@/lib/pipelineConfigSchema';

function parseConfigKeys(raw: string): Set<string> {
  const keys = new Set<string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.includes('=') ? '=' : trimmed.includes(':') ? ':' : null;
    if (!sep) continue;
    const idx = trimmed.indexOf(sep);
    const key = trimmed.slice(0, idx).trim();
    if (key) keys.add(key);
  }
  return keys;
}

describe('pipelineConfigSchema', () => {
  it('matches pipeline-config.example.txt keys', () => {
    const root = join(__dirname, '..', '..', '..');
    const example = readFileSync(join(root, 'pipeline-config.example.txt'), 'utf8');
    const exampleKeys = parseConfigKeys(example);
    const optionalOmitted = new Set(['enrich_keywords_after_report']);
    for (const key of ALL_SCHEMA_KEYS) {
      if (optionalOmitted.has(key)) continue;
      expect(exampleKeys.has(key)).toBe(true);
    }
    for (const key of exampleKeys) {
      expect(ALL_SCHEMA_KEYS.has(key)).toBe(true);
    }
  });
});
