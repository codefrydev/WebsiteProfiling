import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ALL_SCHEMA_KEYS,
  BROWSER_CRAWL_UNAVAILABLE_MSG,
  INTERNAL_PIPELINE_KEYS,
  getFieldByKey,
  isPipelineFieldVisible,
  validatePipelineRun,
} from '@/lib/pipelineConfigSchema';

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
    const optionalOmitted = new Set([
      'enrich_keywords_after_report',
      ...INTERNAL_PIPELINE_KEYS,
    ]);
    for (const key of ALL_SCHEMA_KEYS) {
      if (optionalOmitted.has(key)) continue;
      expect(exampleKeys.has(key)).toBe(true);
    }
    for (const key of exampleKeys) {
      expect(ALL_SCHEMA_KEYS.has(key)).toBe(true);
    }
  });
});

describe('isPipelineFieldVisible', () => {
  const jsConcurrency = getFieldByKey('crawl_js_concurrency');
  const jsTimeout = getFieldByKey('crawl_js_timeout');
  const captureConsole = getFieldByKey('crawl_js_capture_console');

  it('hides JS fields when crawl_render_mode is static', () => {
    expect(jsConcurrency).toBeDefined();
    expect(isPipelineFieldVisible(jsConcurrency!, { crawl_render_mode: 'static' })).toBe(false);
    expect(isPipelineFieldVisible(jsTimeout!, { crawl_render_mode: 'static' })).toBe(false);
    expect(isPipelineFieldVisible(captureConsole!, { crawl_render_mode: 'static' })).toBe(false);
  });

  it('shows JS fields for javascript and auto modes', () => {
    expect(isPipelineFieldVisible(jsConcurrency!, { crawl_render_mode: 'javascript' })).toBe(true);
    expect(isPipelineFieldVisible(jsConcurrency!, { crawl_render_mode: 'auto' })).toBe(true);
    expect(isPipelineFieldVisible(jsTimeout!, { crawl_render_mode: 'javascript' })).toBe(true);
    expect(isPipelineFieldVisible(captureConsole!, { crawl_render_mode: 'javascript' })).toBe(true);
    expect(isPipelineFieldVisible(captureConsole!, { crawl_render_mode: 'auto' })).toBe(true);
  });
});

describe('validatePipelineRun browser preflight', () => {
  const baseState = {
    start_url: 'https://example.com',
    site_name: 'Example',
    crawl_render_mode: 'javascript',
    run_crawl: true,
  };

  it('blocks crawl when JS mode is selected and browser is unavailable', () => {
    const errors = validatePipelineRun({
      state: baseState,
      command: 'crawl',
      browserStatus: { ok: false, message: 'missing chromium' },
    });
    expect(errors.some((e) => e.includes('missing chromium'))).toBe(true);
  });

  it('uses default message when browser status has no detail', () => {
    const errors = validatePipelineRun({
      state: { ...baseState, crawl_render_mode: 'auto' },
      command: null,
      browserStatus: { ok: false },
    });
    expect(errors).toContain(BROWSER_CRAWL_UNAVAILABLE_MSG);
  });

  it('does not require browser for static crawl mode', () => {
    const errors = validatePipelineRun({
      state: { ...baseState, crawl_render_mode: 'static' },
      command: 'crawl',
      browserStatus: { ok: false, message: 'missing chromium' },
    });
    expect(errors.some((e) => e.includes('missing chromium'))).toBe(false);
  });

  it('skips browser check when crawl is not part of the run', () => {
    const errors = validatePipelineRun({
      state: { ...baseState, run_crawl: false },
      command: 'report',
      browserStatus: { ok: false, message: 'missing chromium' },
    });
    expect(errors.some((e) => e.includes('missing chromium'))).toBe(false);
  });
});
