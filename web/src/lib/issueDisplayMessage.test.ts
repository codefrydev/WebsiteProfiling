import { describe, expect, it } from 'vitest';
import { issueDisplayMessage, lighthouseFailureLabel } from './issueDisplayMessage';

describe('issueDisplayMessage', () => {
  it('repairs legacy bare audit id messages', () => {
    expect(issueDisplayMessage('image-alt:')).toBe('Image Alt');
    expect(issueDisplayMessage('link-name:')).toBe('Link Name');
  });

  it('passes through normal messages', () => {
    expect(issueDisplayMessage('LCP exceeds threshold')).toBe('LCP exceeds threshold');
  });
});

describe('lighthouseFailureLabel', () => {
  it('prefers title and description', () => {
    expect(
      lighthouseFailureLabel({
        id: 'image-alt',
        title: 'Image elements do not have alt',
        description: 'Add alt text to images.',
      }),
    ).toBe('Image elements do not have alt: Add alt text to images.');
  });

  it('falls back to title only', () => {
    expect(
      lighthouseFailureLabel({
        id: 'image-alt',
        title: 'Image elements do not have alt',
      }),
    ).toBe('Image elements do not have alt');
  });
});
