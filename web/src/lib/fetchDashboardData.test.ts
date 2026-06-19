import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchWidgetData, clearWidgetDataCache } from '@/lib/fetchDashboardData';
import type { WidgetBinding } from '@/types/dashboard';

vi.mock('@/lib/fetchAuditTool', () => ({
  fetchAuditTool: vi.fn(),
}));

import { fetchAuditTool } from '@/lib/fetchAuditTool';
const mockFetch = fetchAuditTool as ReturnType<typeof vi.fn>;

const PROPERTY_ID = 1;
const REPORT_ID = 10;

function binding(overrides: Partial<WidgetBinding> = {}): WidgetBinding {
  return {
    source: 'audit-tool',
    toolName: 'get_report_summary',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  // Reset the result cache so each test starts cold (cache keys are tool+property+report+args).
  clearWidgetDataCache();
});

// ── getPath / select ─────────────────────────────────────────────────────────

describe('fetchWidgetData – select (getPath)', () => {
  it('uses the entire result when select is absent', async () => {
    mockFetch.mockResolvedValue({ score: 78, total_pages: 200 });
    const result = await fetchWidgetData(binding({ valueField: 'score' }), PROPERTY_ID, REPORT_ID);
    expect(result.kpiValue).toBe(78);
    expect(result.raw).toEqual({ score: 78, total_pages: 200 });
  });

  it('extracts a nested value via a dot-path select', async () => {
    mockFetch.mockResolvedValue({ meta: { health_score: 91 } });
    const result = await fetchWidgetData(
      binding({ select: 'meta', valueField: 'health_score' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(91);
  });

  it('returns null kpiValue when the selected path does not exist', async () => {
    mockFetch.mockResolvedValue({ other: 1 });
    const result = await fetchWidgetData(
      binding({ select: 'missing_path', valueField: 'score' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBeNull();
  });
});

// ── asRows ───────────────────────────────────────────────────────────────────

describe('fetchWidgetData – rows extraction (asRows)', () => {
  it('treats a top-level array result as rows', async () => {
    const rows = [{ url: '/a', score: 80 }, { url: '/b', score: 90 }];
    mockFetch.mockResolvedValue(rows);
    const result = await fetchWidgetData(binding(), PROPERTY_ID, REPORT_ID);
    expect(result.rows).toEqual(rows);
  });

  it('follows select to find a nested array', async () => {
    const pages = [{ url: '/a', lcp: 2.1 }, { url: '/b', lcp: 3.5 }];
    mockFetch.mockResolvedValue({ pages, total: 2 });
    const result = await fetchWidgetData(binding({ select: 'pages' }), PROPERTY_ID, REPORT_ID);
    expect(result.rows).toEqual(pages);
  });

  it('auto-discovers the first array value on an object result', async () => {
    const issues = [{ id: 1 }, { id: 2 }];
    mockFetch.mockResolvedValue({ meta: 'info', issues });
    const result = await fetchWidgetData(binding(), PROPERTY_ID, REPORT_ID);
    expect(result.rows).toEqual(issues);
  });

  it('returns empty rows when the result has no array', async () => {
    mockFetch.mockResolvedValue({ score: 78 });
    const result = await fetchWidgetData(binding(), PROPERTY_ID, REPORT_ID);
    expect(result.rows).toEqual([]);
  });
});

// ── aggregate ────────────────────────────────────────────────────────────────

describe('fetchWidgetData – aggregate', () => {
  const rows = [
    { page: '/a', size: 100 },
    { page: '/b', size: 200 },
    { page: '/c', size: 300 },
  ];

  beforeEach(() => {
    mockFetch.mockResolvedValue(rows);
  });

  it('sum aggregates numeric yField across rows', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'sum', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(600);
  });

  it('avg aggregates correctly', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'avg', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(200);
  });

  it('count returns the number of rows', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'count', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(3);
  });

  it('max returns the largest value', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'max', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(300);
  });

  it('min returns the smallest value', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'min', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(100);
  });

  it('aggregate is skipped when op is "none"', async () => {
    const result = await fetchWidgetData(
      binding({ aggregate: 'none', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBeNull();
  });

  it('valueField takes precedence over aggregate', async () => {
    mockFetch.mockResolvedValue({ score: 55, data: rows });
    const result = await fetchWidgetData(
      binding({ valueField: 'score', aggregate: 'sum', yField: 'size' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(55);
  });
});

// ── kpiValue from scalar valueField ──────────────────────────────────────────

describe('fetchWidgetData – kpiValue from scalar valueField', () => {
  it('returns a numeric value directly from the result', async () => {
    mockFetch.mockResolvedValue({ health_score: 87 });
    const result = await fetchWidgetData(
      binding({ valueField: 'health_score' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(87);
  });

  it('returns a string value as-is', async () => {
    mockFetch.mockResolvedValue({ grade: 'A' });
    const result = await fetchWidgetData(
      binding({ valueField: 'grade' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe('A');
  });

  it('returns null when valueField key is absent from result', async () => {
    mockFetch.mockResolvedValue({ other_key: 42 });
    const result = await fetchWidgetData(
      binding({ valueField: 'missing' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBeNull();
  });

  it('resolves a top-level valueField even when select points at a rows array', async () => {
    // A single tool feeding both a chart (rows via select) and a scalar KPI.
    mockFetch.mockResolvedValue({ total_violations: 7, violations_by_rule: [{ rule_id: 'x', count: 7 }] });
    const result = await fetchWidgetData(
      binding({ select: 'violations_by_rule', valueField: 'total_violations' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.rows).toEqual([{ rule_id: 'x', count: 7 }]);
    expect(result.kpiValue).toBe(7);
  });

  it('resolves a nested dot-path valueField from the raw result', async () => {
    mockFetch.mockResolvedValue({ summary: { category_scores: { performance: 88 } } });
    const result = await fetchWidgetData(
      binding({ valueField: 'summary.category_scores.performance' }),
      PROPERTY_ID,
      REPORT_ID,
    );
    expect(result.kpiValue).toBe(88);
  });
});

// ── in-flight dedup ───────────────────────────────────────────────────────────

describe('fetchWidgetData – in-flight dedup', () => {
  it('calls fetchAuditTool only once for concurrent identical requests', async () => {
    mockFetch.mockResolvedValue({ score: 70 });
    const b = binding({ toolName: 'get_dedup_test' });
    await Promise.all([
      fetchWidgetData(b, PROPERTY_ID, REPORT_ID),
      fetchWidgetData(b, PROPERTY_ID, REPORT_ID),
      fetchWidgetData(b, PROPERTY_ID, REPORT_ID),
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('serves a cached result for a second sequential request within the TTL', async () => {
    mockFetch.mockResolvedValue({ score: 70 });
    const b = binding({ toolName: 'get_seq_test' });
    await fetchWidgetData(b, PROPERTY_ID, REPORT_ID);
    await fetchWidgetData(b, PROPERTY_ID, REPORT_ID);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache is cleared', async () => {
    mockFetch.mockResolvedValue({ score: 70 });
    const b = binding({ toolName: 'get_clear_test' });
    await fetchWidgetData(b, PROPERTY_ID, REPORT_ID);
    clearWidgetDataCache();
    await fetchWidgetData(b, PROPERTY_ID, REPORT_ID);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ── error propagation ─────────────────────────────────────────────────────────

describe('fetchWidgetData – error propagation', () => {
  it('re-throws errors from fetchAuditTool', async () => {
    mockFetch.mockRejectedValue(new Error('tool failed'));
    await expect(fetchWidgetData(binding(), PROPERTY_ID, REPORT_ID)).rejects.toThrow('tool failed');
  });
});
