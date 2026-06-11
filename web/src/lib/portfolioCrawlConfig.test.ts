import { describe, expect, it } from 'vitest';
import {
  formatDiscoveryModeLabel,
  formatPortfolioCrawlSummary,
  formatRenderModeLabel,
  hasPortfolioCrawlConfig,
} from './portfolioCrawlConfig';

describe('formatRenderModeLabel', () => {
  it('maps known render modes', () => {
    expect(formatRenderModeLabel('static')).toBeTruthy();
    expect(formatRenderModeLabel('javascript')).toBeTruthy();
    expect(formatRenderModeLabel('auto')).toBeTruthy();
  });
});

describe('formatDiscoveryModeLabel', () => {
  it('maps known discovery modes', () => {
    expect(formatDiscoveryModeLabel('spider')).toBeTruthy();
    expect(formatDiscoveryModeLabel('sitemap')).toBeTruthy();
    expect(formatDiscoveryModeLabel('list')).toBeTruthy();
    expect(formatDiscoveryModeLabel('hybrid')).toBeTruthy();
  });
});

describe('formatPortfolioCrawlSummary', () => {
  it('returns static mode and limit line for audited crawl scope', () => {
    const segments = formatPortfolioCrawlSummary({
      render_mode: 'static',
      discovery_mode: 'spider',
      pages_crawled: 500,
      max_pages_configured: 500,
      crawl_limited: true,
    });
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments.some((s) => /500/.test(s))).toBe(true);
    expect(segments.some((s) => /limit reached/i.test(s))).toBe(true);
  });

  it('includes static vs rendered mix for auto mode', () => {
    const segments = formatPortfolioCrawlSummary({
      render_mode: 'auto',
      discovery_mode: 'spider',
      pages_crawled: 20,
      max_pages_configured: 500,
      pages_static: 12,
      pages_rendered: 8,
    });
    expect(segments.some((s) => /12/.test(s) && /8/.test(s))).toBe(true);
  });

  it('supports crawl-only fallback with render and discovery only', () => {
    const segments = formatPortfolioCrawlSummary({
      render_mode: 'javascript',
      discovery_mode: 'list',
      pages_crawled: 42,
    });
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments.some((s) => /42/.test(s))).toBe(true);
  });

  it('returns empty for null config', () => {
    expect(formatPortfolioCrawlSummary(null)).toEqual([]);
    expect(hasPortfolioCrawlConfig(null)).toBe(false);
  });
});
