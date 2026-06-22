import { describe, expect, it } from 'vitest';
import { formatValue, thresholdColor } from '@/lib/dashboard/viz/formatters';

describe('formatValue', () => {
  it('renders em-dash for null/undefined/non-finite', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(Infinity)).toBe('—');
    expect(formatValue(NaN)).toBe('—');
  });

  it('passes strings through unchanged', () => {
    expect(formatValue('A')).toBe('A');
  });

  it('default groups integers and shows one decimal for floats', () => {
    expect(formatValue(1234)).toBe('1,234');
    expect(formatValue(1.25)).toBe('1.3');
  });

  it('fixed-decimal patterns', () => {
    expect(formatValue(1.2, '0')).toBe('1');
    expect(formatValue(1.25, '0.0')).toBe('1.3');
    expect(formatValue(1, '0.00')).toBe('1.00');
  });

  it('fraction percent scales by 100', () => {
    expect(formatValue(0.0345, '0.0%')).toBe('3.5%');
    expect(formatValue(0.5, '%')).toBe('50.0%');
  });

  it('pct treats value as already a percentage', () => {
    expect(formatValue(85, 'pct')).toBe('85%');
    expect(formatValue(85.4, 'pct')).toBe('85.4%');
  });

  it('score renders as N/100', () => {
    expect(formatValue(91.6, 'score')).toBe('92/100');
  });
});

describe('thresholdColor', () => {
  const thresholds = [
    { value: 50, color: 'red' },
    { value: 90, color: 'green' },
  ];

  it('returns the highest threshold at or below the value', () => {
    expect(thresholdColor(95, thresholds)).toBe('green');
    expect(thresholdColor(60, thresholds)).toBe('red');
  });

  it('returns undefined below all thresholds or with no thresholds', () => {
    expect(thresholdColor(10, thresholds)).toBeUndefined();
    expect(thresholdColor(95, [])).toBeUndefined();
    expect(thresholdColor(null, thresholds)).toBeUndefined();
  });
});
