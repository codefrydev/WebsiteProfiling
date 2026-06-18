import { describe, expect, it } from 'vitest';
import {
  buildIssuesPrompt,
  dedupeIssues,
  formatActionPlanSection,
  MAX_PROMPT_ISSUES,
} from './buildIssuesPrompt';

describe('dedupeIssues', () => {
  it('merges same message across different URLs', () => {
    const result = dedupeIssues([
      {
        category: 'Technical SEO',
        issue: { message: 'Missing title', url: 'https://example.com/a', priority: 'High' },
      },
      {
        category: 'Technical SEO',
        issue: { message: 'Missing title', url: 'https://example.com/b', priority: 'Medium' },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].urlCount).toBe(2);
    expect(result[0].sampleUrls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(result[0].priority).toBe('High');
  });

  it('keeps separate rows for different messages', () => {
    const result = dedupeIssues([
      {
        category: 'Links',
        issue: { message: 'Broken link', url: 'https://example.com/a', priority: 'Critical' },
      },
      {
        category: 'Links',
        issue: { message: 'Redirect chain', url: 'https://example.com/b', priority: 'High' },
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].priority).toBe('Critical');
  });

  it('treats same message on same URL with/without trailing slash as one URL', () => {
    const result = dedupeIssues([
      {
        category: 'Links',
        issue: { message: 'Broken link', url: 'https://example.com/page/', priority: 'High' },
      },
      {
        category: 'Links',
        issue: { message: 'Broken link', url: 'https://example.com/page', priority: 'High' },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].urlCount).toBe(1);
    expect(result[0].sampleUrls).toEqual(['https://example.com/page']);
  });
});

describe('buildIssuesPrompt', () => {
  it('formats prompt with site metadata and priority sections', () => {
    const { prompt, rawCount, uniqueCount } = buildIssuesPrompt('codefrydev.in', [
      {
        category: 'Technical SEO',
        issue: {
          message: 'Missing meta description',
          url: 'https://codefrydev.in/blog',
          priority: 'Medium',
          recommendation: 'Add a meta description',
        },
      },
    ]);
    expect(rawCount).toBe(1);
    expect(uniqueCount).toBe(1);
    expect(prompt).toContain('Domain: codefrydev.in');
    expect(prompt).toContain('## Medium');
    expect(prompt).toContain('Missing meta description');
    expect(prompt).toContain('Rule fix: Add a meta description');
  });

  it('truncates to MAX_PROMPT_ISSUES and adds footer', () => {
    const items = Array.from({ length: MAX_PROMPT_ISSUES + 5 }, (_, i) => ({
      category: 'Technical SEO',
      issue: {
        message: `Issue ${i}`,
        url: `https://example.com/${i}`,
        priority: 'Low',
        impact_score: i,
      },
    }));
    const { prompt, includedCount, omittedCount } = buildIssuesPrompt('example.com', items);
    expect(includedCount).toBe(MAX_PROMPT_ISSUES);
    expect(omittedCount).toBe(5);
    expect(prompt).toContain(`… and 5 more lower-priority issues omitted.`);
  });
});

describe('formatActionPlanSection', () => {
  it('wraps plan text in a markdown section', () => {
    expect(formatActionPlanSection('Fix titles first.')).toContain('## AI action plan');
    expect(formatActionPlanSection('Fix titles first.')).toContain('Fix titles first.');
  });

  it('returns empty string for blank input', () => {
    expect(formatActionPlanSection('   ')).toBe('');
  });
});
