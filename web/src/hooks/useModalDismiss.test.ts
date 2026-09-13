import { describe, it, expect } from 'vitest';
import { isEscapeKey } from './useModalDismiss';

describe('useModalDismiss helpers', () => {
  it('returns true when key is Escape', () => {
    expect(isEscapeKey({ key: 'Escape' })).toBe(true);
  });

  it('returns false for other keys', () => {
    expect(isEscapeKey({ key: 'Enter' })).toBe(false);
    expect(isEscapeKey({ key: 'Tab' })).toBe(false);
    expect(isEscapeKey({ key: 'Backspace' })).toBe(false);
  });
});
