import { describe, expect, it } from 'vitest';
import { stripRedundantMarkdown } from './stripRedundantMarkdown';
import type { ChatBlock } from './deriveChatBlocks';

describe('stripRedundantMarkdown', () => {
  it('removes category score table when category_scores block exists', () => {
    const content = `## Summary

| Category | Score |
| --- | --- |
| Crawl | 0 |
| HTTPS | 100 |

Focus on crawl coverage next.`;

    const blocks: ChatBlock[] = [
      {
        type: 'category_scores',
        categories: [{ name: 'Crawl', score: 0 }],
      },
    ];

    const out = stripRedundantMarkdown(content, blocks);
    expect(out).not.toContain('| Crawl | 0 |');
    expect(out).toContain('Focus on crawl coverage next.');
  });

  it('leaves content unchanged when no matching blocks', () => {
    const content = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    expect(stripRedundantMarkdown(content, [])).toBe(content);
  });

  it('strips audit opener when overview blocks exist', () => {
    const content = `Here's a quick read on the latest audit for codefrydev.in (health score: 74/100, 30 URLs crawled, 100% success rate).

### What needs attention
Focus on mobile viewport tags.`;

    const blocks: ChatBlock[] = [
      {
        type: 'issue_summary',
        healthScore: 74,
        counts: { High: 5 },
        totalUrls: 30,
        successRate: 1,
      },
      {
        type: 'status_breakdown',
        items: [{ label: '2xx', value: 30 }],
        totalUrls: 30,
        successRate: 1,
      },
    ];

    const out = stripRedundantMarkdown(content, blocks);
    expect(out).not.toContain('health score: 74');
    expect(out).not.toContain('30 URLs crawled');
    expect(out).toContain('What needs attention');
    expect(out).toContain('mobile viewport');
  });

  it('strips issue details prose when issue_table block exists', () => {
    const content = `## Recommendations
Fix viewport tags on mobile templates.

Issue details: Critical Issue 1. Pages missing viewport meta tag — Mobile SEO
Priority: Critical
Affected URLs (2):
https://example.com/long-path/page-one
https://example.com/long-path/page-two`;

    const blocks: ChatBlock[] = [
      {
        type: 'issue_table',
        issues: [
          {
            priority: 'Critical',
            category: 'Mobile SEO',
            url: 'https://example.com',
            message: 'Missing viewport',
          },
        ],
      },
    ];

    const out = stripRedundantMarkdown(content, blocks);
    expect(out).toContain('Recommendations');
    expect(out).not.toContain('Issue details');
    expect(out).not.toContain('https://example.com/long-path');
  });

  it('strips lighthouse prose when lighthouse block exists', () => {
    const content = `### Insights
Performance score: 42. SEO score: 91.
Poor performance pages listed below.`;
    const blocks: ChatBlock[] = [
      {
        type: 'lighthouse_scores',
        scores: { performance: 42, seo: 91 },
        poorPages: [],
      },
    ];
    const out = stripRedundantMarkdown(content, blocks);
    expect(out.toLowerCase()).not.toContain('performance score');
  });
});
