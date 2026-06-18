import { describe, expect, it } from 'vitest';
import {
  buildBrowserErrorsPrompt,
  dedupeBrowserErrors,
} from './buildBrowserErrorsPrompt';
import type { FlatBrowserErrorRow } from './browserErrors';

describe('dedupeBrowserErrors', () => {
  it('merges same console message across URLs', () => {
    const result = dedupeBrowserErrors([
      {
        id: '1',
        url: 'https://example.com/a',
        type: 'console',
        message: 'Failed to load resource',
        source_url: 'https://cdn.example.com/app.js',
        line: 42,
      },
      {
        id: '2',
        url: 'https://example.com/b',
        type: 'console',
        message: 'Failed to load resource',
        source_url: 'https://cdn.example.com/app.js',
        line: 42,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].urlCount).toBe(2);
    expect(result[0].priority).toBe('Medium');
  });

  it('ranks exceptions above console errors', () => {
    const result = dedupeBrowserErrors([
      {
        id: '1',
        url: 'https://example.com/a',
        type: 'console',
        message: 'Warning',
      },
      {
        id: '2',
        url: 'https://example.com/b',
        type: 'exception',
        message: 'TypeError: x is not a function',
        stack: 'at foo (app.js:1)',
      },
    ]);
    expect(result[0].errorType).toBe('exception');
    expect(result[0].priority).toBe('High');
  });
});

describe('buildBrowserErrorsPrompt', () => {
  it('formats prompt with JS-specific instructions', () => {
    const rows: FlatBrowserErrorRow[] = [
      {
        id: '1',
        url: 'https://codefrydev.in/',
        type: 'exception',
        message: 'ReferenceError: foo is not defined',
        stack: 'at main.js:10',
      },
    ];
    const { prompt, uniqueCount } = buildBrowserErrorsPrompt('codefrydev.in', rows, 'javascript');
    expect(uniqueCount).toBe(1);
    expect(prompt).toContain('frontend debugging specialist');
    expect(prompt).toContain('Render mode: javascript');
    expect(prompt).toContain('ReferenceError: foo is not defined');
  });
});
