import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeChartSpec,
  validateMeasure,
  validateTransform,
  assignLayouts,
  generateWidget,
  AiGenerateError,
} from '@/lib/dashboard/ai/generate';
import type { Widget } from '@/lib/dashboard/types';

// ──────────────────────────────────────────────────────────────────────────────
// sanitizeChartSpec
// ──────────────────────────────────────────────────────────────────────────────

describe('sanitizeChartSpec', () => {
  it('accepts a valid minimal spec', () => {
    const spec = sanitizeChartSpec({ type: 'bar' });
    expect(spec.type).toBe('bar');
  });

  it('throws when type is missing', () => {
    expect(() => sanitizeChartSpec({ labelField: 'x' })).toThrow(/type/);
  });

  it('throws when input is not an object', () => {
    expect(() => sanitizeChartSpec('bar')).toThrow();
  });

  it('drops undefined and function values via JSON round-trip', () => {
    const raw = {
      type: 'pie',
      options: { onClick: undefined },
    };
    const spec = sanitizeChartSpec(raw);
    // undefined props dropped by JSON serialization
    expect(spec.options).not.toHaveProperty('onClick');
  });

  it('caps dataset labels at 500', () => {
    const labels = Array.from({ length: 600 }, (_, i) => `label-${i}`);
    const spec = sanitizeChartSpec({
      type: 'bar',
      data: { labels, datasets: [] },
    });
    expect(spec.data!.labels).toHaveLength(500);
  });

  it('caps dataset rows at 500 and datasets at 20', () => {
    const manyDatasets = Array.from({ length: 25 }, (_, i) => ({
      label: `ds-${i}`,
      data: Array.from({ length: 600 }, (_, j) => j),
    }));
    const spec = sanitizeChartSpec({
      type: 'radar',
      data: { labels: [], datasets: manyDatasets },
    });
    expect(spec.data!.datasets).toHaveLength(20);
    expect((spec.data!.datasets as { data: unknown[] }[])[0].data).toHaveLength(500);
  });

  it('caps series at 20', () => {
    const series = Array.from({ length: 30 }, (_, i) => ({ label: `s${i}`, field: `f${i}` }));
    const spec = sanitizeChartSpec({ type: 'line', series });
    expect(spec.series).toHaveLength(20);
  });

  it('passes through chartSpec type unchanged', () => {
    const spec = sanitizeChartSpec({ type: 'polarArea', series: [] });
    expect(spec.type).toBe('polarArea');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DashScript validation
// ──────────────────────────────────────────────────────────────────────────────

describe('validateMeasure', () => {
  it('accepts a valid field call', () => {
    expect(validateMeasure('field("health_score")')).toBeNull();
  });

  it('accepts arithmetic', () => {
    expect(validateMeasure('sum("count") / count()')).toBeNull();
  });

  it('accepts an if expression', () => {
    expect(validateMeasure('if(score >= 80, "Good", "Poor")')).toBeNull();
  });

  it('returns an error string for invalid syntax', () => {
    expect(validateMeasure('field(')).not.toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateMeasure('')).toBeNull();
  });
});

describe('validateTransform', () => {
  it('accepts a simple pipeline', () => {
    expect(validateTransform('filter(count > 0) | sort(count, desc) | take(10)')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateTransform('')).toBeNull();
  });

  it('returns an error for malformed pipeline', () => {
    expect(validateTransform('filter( | sort')).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// assignLayouts
// ──────────────────────────────────────────────────────────────────────────────

describe('assignLayouts', () => {
  type PartialWidget = Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout'] };
  const base: PartialWidget = {
    title: 'W',
    viz: 'kpi' as const,
    binding: { source: 'audit-tool' as const, toolName: 'get_report_summary' },
  };

  it('replaces Infinity y with bottomY', () => {
    const widgets = assignLayouts([{ ...base, layout: { x: 0, y: Infinity, w: 3, h: 2 } }], 5);
    expect(widgets[0].layout.y).toBe(5);
  });

  it('assigns unique ids', () => {
    const widgets = assignLayouts([base, base]);
    expect(widgets[0].id).not.toBe(widgets[1].id);
  });

  it('wraps widgets that exceed 12 columns', () => {
    const wide: PartialWidget = { ...base, layout: { x: 0, y: 0, w: 8, h: 4 } };
    const narrow: PartialWidget = { ...base, layout: { x: 0, y: 0, w: 8, h: 4 } };
    const widgets = assignLayouts([wide, narrow], 0);
    // Second widget should wrap to x: 0 on a new row
    expect(widgets[1].layout.x).toBe(0);
    expect(widgets[1].layout.y).toBeGreaterThan(0);
  });

  it('uses defaultWidgetLayout when layout is missing', () => {
    const widgets = assignLayouts([base], 0);
    expect(widgets[0].layout.w).toBeGreaterThan(0);
    expect(Number.isFinite(widgets[0].layout.y)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateWidget (mocked fetch)
// ──────────────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('generateWidget', () => {
  it('returns a widget with concrete layout', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        widget: {
          title: 'Health',
          toolName: 'get_report_summary',
          viz: 'kpi',
          binding: { source: 'audit-tool', toolName: 'get_report_summary', valueField: 'health_score' },
          options: {},
        },
        explanation: 'Shows health score.',
      }),
    });
    const { widget } = await generateWidget('show health score');
    expect(widget.viz).toBe('kpi');
    expect(widget.id).toBeTruthy();
    expect(Number.isFinite(widget.layout.y)).toBe(true);
  });

  it('throws AiGenerateError on missing/disabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: 'AI insights are disabled.', missing: true }),
    });
    await expect(generateWidget('test')).rejects.toBeInstanceOf(AiGenerateError);
  });

  it('sanitizes chartSpec in widget options', async () => {
    const manyLabels = Array.from({ length: 600 }, (_, i) => `l-${i}`);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        widget: {
          title: 'Custom',
          toolName: 'get_report_summary',
          viz: 'custom-chart',
          binding: { source: 'audit-tool', toolName: 'get_report_summary' },
          options: {
            chartSpec: { type: 'bar', data: { labels: manyLabels, datasets: [] } },
          },
        },
        explanation: 'Chart',
      }),
    });
    const { widget } = await generateWidget('custom chart');
    expect(widget.options?.chartSpec?.data?.labels).toHaveLength(500);
  });
});
