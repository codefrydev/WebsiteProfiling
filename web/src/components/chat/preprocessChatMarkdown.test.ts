import { describe, expect, it } from 'vitest';
import { preprocessChatMarkdown } from './preprocessChatMarkdown';

describe('preprocessChatMarkdown', () => {
  it('splits run-on section headings into markdown headings', () => {
    const raw =
      "Here's a quick read (health score: 74/100). What looks good Crawl health is clean — 30/30 URLs returned 2xx.";
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('### What looks good');
    expect(out).toContain('Crawl health is clean');
  });

  it('normalizes em-dash bullets to list items', () => {
    const raw = 'Fix these next.\n— Add viewport meta\n— Improve titles';
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('- Add viewport meta');
  });

  it('normalizes emoji power insights title', () => {
    const raw =
      '🔎 Power Insights for codefrydev.in\nInsight What the data shows Overall health The score is moderate.';
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('### Power Insights');
  });

  it('promotes bold section lines to headings', () => {
    const raw = '**Recommended actions**\n1. Fix canonical tags';
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('### Recommended actions');
  });

  it('unwraps insight pipe rows to headings instead of tables', () => {
    const raw = '| Insight | What the data shows |\n| Core Web Vitals | Score 100 – great! |';
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('### What the data shows');
    expect(out).not.toContain('| Category | Notes |');
    expect(out).not.toContain('| Insight |');
  });

  it('does not table-ify single score pipe rows', () => {
    const raw = '| Security | Score 50 – review findings. |';
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('**Security**');
    expect(out).not.toMatch(/\| --- \| --- \|/);
  });
});
