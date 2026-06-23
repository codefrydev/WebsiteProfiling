import { describe, expect, it } from 'vitest';
import { applyFilters } from '@/lib/dashboard/data/fetchWidgetData';
import type { DashboardFilter, CrossFilter } from '@/lib/dashboard/types';

const ROWS = [
  { name: 'SEO', score: 80, status: 'good' },
  { name: 'Performance', score: 50, status: 'warn' },
  { name: 'Security', score: 20, status: 'poor' },
];

describe('applyFilters', () => {
  it('returns all rows when no filters', () => {
    expect(applyFilters(ROWS, [], 'get_category_scores')).toHaveLength(3);
  });

  it('filters by single select', () => {
    const f: DashboardFilter = {
      id: 'f1', label: 'Status', field: 'status', type: 'select', value: 'good',
    };
    const result = applyFilters(ROWS, [f], 'get_category_scores');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('SEO');
  });

  it('filters by multiselect', () => {
    const f: DashboardFilter = {
      id: 'f1', label: 'Status', field: 'status', type: 'multiselect', value: ['good', 'warn'],
    };
    const result = applyFilters(ROWS, [f], 'get_category_scores');
    expect(result).toHaveLength(2);
  });

  it('filters by search (substring)', () => {
    const f: DashboardFilter = {
      id: 'f1', label: 'Name', field: 'name', type: 'search', value: 'sec',
    };
    const result = applyFilters(ROWS, [f], 'get_category_scores');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Security');
  });

  it('filters by cross-filter (exact match)', () => {
    const cf: CrossFilter = {
      id: 'cf1', field: 'status', value: 'poor', sourceWidgetId: 'w1',
    };
    const result = applyFilters(ROWS, [cf], 'get_category_scores');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Security');
  });

  it('respects appliesTo — skips filter for non-matching toolName', () => {
    const f: DashboardFilter = {
      id: 'f1', label: 'Status', field: 'status', type: 'select', value: 'good',
      appliesTo: ['other_tool'],
    };
    const result = applyFilters(ROWS, [f], 'get_category_scores');
    expect(result).toHaveLength(3);
  });

  it('applies multiple filters as AND', () => {
    const f1: DashboardFilter = {
      id: 'f1', label: 'Status', field: 'status', type: 'select', value: 'warn',
    };
    const cf: CrossFilter = {
      id: 'cf1', field: 'name', value: 'Performance', sourceWidgetId: 'w1',
    };
    const result = applyFilters(ROWS, [f1, cf], 'get_category_scores');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Performance');
  });

  it('empty select value passes all rows through', () => {
    const f: DashboardFilter = {
      id: 'f1', label: 'Status', field: 'status', type: 'select', value: '',
    };
    expect(applyFilters(ROWS, [f], 'get_category_scores')).toHaveLength(3);
  });
});
