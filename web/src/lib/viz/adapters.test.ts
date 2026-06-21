import { describe, it, expect } from 'vitest';
import { chartDataToBarChartData, dualSeriesToBarChartData, labelsValuesToBarChartData, groupedBarChartData } from './adapters';
import type { ChartData } from 'chart.js';

describe('chartDataToBarChartData', () => {
  it('maps labels and single-series values', () => {
    const input: ChartData<'bar'> = {
      labels: ['a', 'b', 'c'],
      datasets: [{ label: 'Pages', data: [10, 20, 30], backgroundColor: '#ff0000' }],
    };
    const result = chartDataToBarChartData(input);
    expect(result.labels).toEqual(['a', 'b', 'c']);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.values).toEqual([10, 20, 30]);
    expect(result.series[0]?.label).toBe('Pages');
  });

  it('expands a scalar backgroundColor into per-bar colors', () => {
    const input: ChartData<'bar'> = {
      labels: ['x', 'y'],
      datasets: [{ data: [1, 2], backgroundColor: '#abc' }],
    };
    const result = chartDataToBarChartData(input);
    expect(result.series[0]?.colors).toEqual(['#abc', '#abc']);
  });

  it('passes through array backgroundColor as colors', () => {
    const input: ChartData<'bar'> = {
      labels: ['x', 'y'],
      datasets: [{ data: [1, 2], backgroundColor: ['#111', '#222'] }],
    };
    const result = chartDataToBarChartData(input);
    expect(result.series[0]?.colors).toEqual(['#111', '#222']);
  });

  it('handles multiple series (grouped)', () => {
    const input: ChartData<'bar'> = {
      labels: ['a', 'b'],
      datasets: [
        { label: 'Title', data: [1, 2], backgroundColor: '#aaa' },
        { label: 'Meta', data: [3, 4], backgroundColor: '#bbb' },
      ],
    };
    const result = chartDataToBarChartData(input);
    expect(result.series).toHaveLength(2);
    expect(result.series[1]?.label).toBe('Meta');
    expect(result.series[1]?.values).toEqual([3, 4]);
  });

  it('handles missing labels and empty datasets', () => {
    const result = chartDataToBarChartData({ datasets: [] });
    expect(result.labels).toEqual([]);
    expect(result.series).toEqual([]);
  });
});

describe('dualSeriesToBarChartData', () => {
  it('maps baseline and current to two series', () => {
    const input = {
      labels: ['A', 'B'],
      baseline: [10, 20],
      current: [15, 25],
    };
    const result = dualSeriesToBarChartData(input, 'Before', 'After');
    expect(result.labels).toEqual(['A', 'B']);
    expect(result.series).toHaveLength(2);
    expect(result.series[0]?.label).toBe('Before');
    expect(result.series[0]?.values).toEqual([10, 20]);
    expect(result.series[1]?.label).toBe('After');
    expect(result.series[1]?.values).toEqual([15, 25]);
  });

  it('coalesces null values to 0', () => {
    const input = {
      labels: ['X', 'Y'],
      baseline: [null, 5],
      current: [3, null],
    };
    const result = dualSeriesToBarChartData(input, 'Baseline', 'Current');
    expect(result.series[0]?.values).toEqual([0, 5]);
    expect(result.series[1]?.values).toEqual([3, 0]);
  });

  it('uses default compare colors', () => {
    const input = { labels: ['A'], baseline: [1], current: [2] };
    const result = dualSeriesToBarChartData(input, 'B', 'C');
    expect(result.series[0]?.colors?.[0]).toBe('#94a3b8');
    expect(result.series[1]?.colors?.[0]).toBe('#3b82f6');
  });

  it('accepts custom colors', () => {
    const input = { labels: ['A'], baseline: [1], current: [2] };
    const result = dualSeriesToBarChartData(input, 'B', 'C', {
      baseline: '#aabbcc',
      current: '#112233',
    });
    expect(result.series[0]?.colors?.[0]).toBe('#aabbcc');
    expect(result.series[1]?.colors?.[0]).toBe('#112233');
  });

  it('handles empty series', () => {
    const result = dualSeriesToBarChartData({ labels: [], baseline: [], current: [] }, 'B', 'C');
    expect(result.labels).toEqual([]);
    expect(result.series[0]?.values).toEqual([]);
    expect(result.series[1]?.values).toEqual([]);
  });
});

describe('labelsValuesToBarChartData', () => {
  it('builds single series with scalar color', () => {
    const result = labelsValuesToBarChartData(['a', 'b'], [1, 2], '#abc');
    expect(result.series[0]?.values).toEqual([1, 2]);
    expect(result.series[0]?.colors).toEqual(['#abc', '#abc']);
  });

  it('builds single series with per-bar colors', () => {
    const result = labelsValuesToBarChartData(['a', 'b'], [1, 2], ['#111', '#222']);
    expect(result.series[0]?.colors).toEqual(['#111', '#222']);
  });
});

describe('groupedBarChartData', () => {
  it('maps multiple datasets to series', () => {
    const result = groupedBarChartData(['x', 'y'], [
      { label: 'A', values: [1, 2], colors: '#aaa' },
      { label: 'B', values: [3, 4], colors: ['#111', '#222'] },
    ]);
    expect(result.series).toHaveLength(2);
    expect(result.series[1]?.colors).toEqual(['#111', '#222']);
  });
});
