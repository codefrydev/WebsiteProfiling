import { describe, expect, it } from 'vitest';
import {
  ALL_SCHEMA_KEYS,
  BROWSER_CRAWL_UNAVAILABLE_MSG,
  getFieldByKey,
  isPipelineFieldVisible,
  validatePipelineRun,
} from '@/lib/pipelineConfigSchema';

describe('pipelineConfigSchema', () => {
  it('covers all known pipeline keys in schema', () => {
    expect(ALL_SCHEMA_KEYS.size).toBeGreaterThan(50);
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
