import { describe, expect, it } from 'vitest';
import { formatChatPropertyLabel, formatChatPropertyOption } from './chatPropertyLabel';

describe('chatPropertyLabel', () => {
  it('prefers canonical domain over internal property name', () => {
    const property = {
      id: 3,
      name: 'GSC Links Test',
      canonical_domain: 'codefrydev.in',
    };
    expect(formatChatPropertyLabel(property)).toBe('codefrydev.in');
    expect(formatChatPropertyOption(property)).toBe('codefrydev.in · GSC Links Test');
  });
});
