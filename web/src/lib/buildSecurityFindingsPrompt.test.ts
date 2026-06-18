import { describe, expect, it } from 'vitest';
import {
  buildSecurityFindingsPrompt,
  dedupeSecurityFindings,
} from './buildSecurityFindingsPrompt';
import type { SecurityFinding } from '@/types/report';

describe('dedupeSecurityFindings', () => {
  it('merges same finding type and message across URLs', () => {
    const result = dedupeSecurityFindings([
      {
        severity: 'High',
        finding_type: 'missing_hsts',
        url: 'https://example.com/a',
        message: 'Strict-Transport-Security header is missing',
        recommendation: 'Add HSTS header',
      },
      {
        severity: 'Medium',
        finding_type: 'missing_hsts',
        url: 'https://example.com/b',
        message: 'Strict-Transport-Security header is missing',
        recommendation: 'Add HSTS header',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].urlCount).toBe(2);
    expect(result[0].severity).toBe('High');
    expect(result[0].category).toBe('Missing HSTS header');
  });

  it('keeps separate rows for different finding types', () => {
    const result = dedupeSecurityFindings([
      {
        severity: 'Critical',
        finding_type: 'missing_csp',
        url: 'https://example.com/',
        message: 'Content-Security-Policy missing',
      },
      {
        severity: 'High',
        finding_type: 'missing_hsts',
        url: 'https://example.com/',
        message: 'HSTS missing',
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].severity).toBe('Critical');
  });
});

describe('buildSecurityFindingsPrompt', () => {
  it('formats prompt with security-specific instructions', () => {
    const findings: SecurityFinding[] = [
      {
        severity: 'High',
        finding_type: 'missing_hsts',
        url: 'https://codefrydev.in/',
        message: 'Strict-Transport-Security header is missing',
        recommendation: 'Enable HSTS with max-age >= 31536000',
      },
    ];
    const { prompt, uniqueCount } = buildSecurityFindingsPrompt('codefrydev.in', findings);
    expect(uniqueCount).toBe(1);
    expect(prompt).toContain('web security and HTTP headers consultant');
    expect(prompt).toContain('## High');
    expect(prompt).toContain('Missing HSTS header');
    expect(prompt).toContain('Enable HSTS');
  });
});
