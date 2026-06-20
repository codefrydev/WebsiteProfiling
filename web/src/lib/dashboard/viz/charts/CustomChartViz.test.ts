/**
 * Unit tests for CustomChartViz data-building logic.
 * We extract and test the pure data-building function without mounting React.
 */
import { describe, it, expect } from 'vitest';

// Replicate the buildChartData logic here so we can test it without JSDOM/Canvas.
// This is a white-box test that mirrors the component's internal logic.

const PALETTE = [
  'rgba(59,130,246,0.8)',
  'rgba(16,185,129,0.8)',
  'rgba(245,158,11,0.8)',
];

interface ChartSpec {
  type: string;
  data?: Record<string, unknown>;
  labelField?: string;
  series?: { label: string; field: string; backgroundColor?: string }[];
}

function buildChartData(spec: ChartSpec, rows: Record<string, unknown>[]) {
  if (spec.data) return spec.data;
  const labelField = spec.labelField ?? 'label';
  const labels = rows.map((r) => String(r[labelField] ?? ''));
  const series = spec.series ?? [];
  if (series.length > 0) {
    return {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: rows.map((r) => (typeof r[s.field] === 'number' ? r[s.field] : 0)),
        backgroundColor: s.backgroundColor ?? PALETTE[i % PALETTE.length],
      })),
    };
  }
  // Fallback: numeric columns
  if (rows.length > 0) {
    const numericCols = Object.entries(rows[0])
      .filter(([k, v]) => k !== labelField && typeof v === 'number')
      .map(([k]) => k);
    return {
      labels,
      datasets: numericCols.map((col, i) => ({
        label: col,
        data: rows.map((r) => (typeof r[col] === 'number' ? r[col] : 0)),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    };
  }
  return { labels: [], datasets: [] };
}

describe('buildChartData', () => {
  const rows = [
    { category: 'Performance', score: 80 },
    { category: 'SEO', score: 90 },
    { category: 'Accessibility', score: 70 },
  ];

  it('uses spec.data as-is when provided', () => {
    const customData = { labels: ['a'], datasets: [] };
    const result = buildChartData({ type: 'bar', data: customData }, rows);
    expect(result).toBe(customData);
  });

  it('builds labels from labelField', () => {
    const result = buildChartData(
      { type: 'bar', labelField: 'category', series: [{ label: 'Score', field: 'score' }] },
      rows,
    ) as { labels: string[]; datasets: { data: number[] }[] };
    expect(result.labels).toEqual(['Performance', 'SEO', 'Accessibility']);
  });

  it('maps series fields to dataset values', () => {
    const result = buildChartData(
      { type: 'bar', labelField: 'category', series: [{ label: 'Score', field: 'score' }] },
      rows,
    ) as { datasets: { label: string; data: number[] }[] };
    expect(result.datasets[0].label).toBe('Score');
    expect(result.datasets[0].data).toEqual([80, 90, 70]);
  });

  it('uses default palette when no backgroundColor is given', () => {
    const result = buildChartData(
      { type: 'pie', labelField: 'category', series: [{ label: 'Score', field: 'score' }] },
      rows,
    ) as { datasets: { backgroundColor: string }[] };
    expect(result.datasets[0].backgroundColor).toBe(PALETTE[0]);
  });

  it('falls back to numeric columns when no series is given', () => {
    const result = buildChartData(
      { type: 'bar', labelField: 'category' },
      rows,
    ) as { labels: string[]; datasets: { label: string }[] };
    expect(result.datasets[0].label).toBe('score');
  });

  it('returns empty data for empty rows and no series', () => {
    const result = buildChartData({ type: 'radar' }, []) as { labels: unknown[]; datasets: unknown[] };
    expect(result.labels).toHaveLength(0);
    expect(result.datasets).toHaveLength(0);
  });
});
