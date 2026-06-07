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
});
