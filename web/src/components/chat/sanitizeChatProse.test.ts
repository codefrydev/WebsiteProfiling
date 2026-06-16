import { describe, expect, it } from 'vitest';
import { preprocessChatMarkdown } from './preprocessChatMarkdown';
import {
  sanitizeChatProse,
  stripLoosePipeScoreRows,
  stripToolNamesFromProse,
} from './sanitizeChatProse';
import { stripRedundantMarkdown } from './stripRedundantMarkdown';
import type { ChatBlock } from './deriveChatBlocks';

describe('sanitizeChatProse', () => {
  it('replaces internal tool names with plain language', () => {
    const raw =
      '- Run a Technical Workflow (run_technical_workflow) to surface issues.\n- export_audit_report (PDF) for delivery.';
    const out = stripToolNamesFromProse(raw);
    expect(out).not.toContain('run_technical_workflow');
    expect(out).not.toContain('export_audit_report');
    expect(out).toContain('technical workflow');
    expect(out).toContain('export audit report');
  });

  it('removes loose pipe score rows', () => {
    const raw = `| Core Web Vitals | Score 100 – great! |
| Security | Score 50 – review findings. |
Keep fixing viewport tags.`;
    const out = stripLoosePipeScoreRows(raw);
    expect(out).not.toContain('Core Web Vitals');
    expect(out).toContain('viewport');
  });

  it('strips health score narration inline', () => {
    const out = sanitizeChatProse(
      "The site's health score is 58 / 100 – moderate.\n\n### Recommended actions\n1. Fix viewport.",
    );
    expect(out.toLowerCase()).not.toContain('health score is 58');
    expect(out).toContain('Recommended actions');
  });

  it('removes closing boilerplate', () => {
    const out = sanitizeChatProse(
      '### Next steps\n- Fix titles.\n\nLet me know which of these actions you\'d like to run!',
    );
    expect(out).not.toMatch(/let me know which/i);
  });

  it('strips Category Notes markdown tables when category blocks exist', () => {
    const raw = `| Category | Notes |
| --- | --- |
| --- | --- |
| Core Web Vitals | Score 100 – great! |

### Power Insights
- Fix viewport.`;
    const out = sanitizeChatProse(raw, { hasCategoryBlocks: true });
    expect(out).not.toContain('Core Web Vitals');
    expect(out).toContain('Power Insights');
  });
});

describe('preprocessChatMarkdown pipe rows legacy', () => {
  it('builds score table only for multiple score rows', () => {
    const raw = `| Core Web Vitals | Score 100 – great! |
| Security | Score 50 – review. |`;
    const out = preprocessChatMarkdown(raw);
    expect(out).toContain('| Category | Notes |');
    expect(out).toContain('Core Web Vitals');
  });
});

describe('stripRedundantMarkdown pipe scores with blocks', () => {
  it('drops pipe score lines when category_scores block exists', () => {
    const blocks: ChatBlock[] = [
      {
        type: 'category_scores',
        categories: [
          { name: 'Security', score: 50 },
          { name: 'Content quality', score: 89 },
        ],
      },
    ];
    const content = `| Security | Score 50 – findings |
| Content quality | Score 89 – strong |

### Power Insights
Focus on security headers.`;
    const out = stripRedundantMarkdown(content, blocks);
    expect(out).not.toContain('Score 50');
    expect(out).toContain('Power Insights');
  });
});
