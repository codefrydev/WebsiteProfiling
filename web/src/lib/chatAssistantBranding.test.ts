import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_ASSISTANT_AVATAR,
  DEFAULT_CHAT_ASSISTANT_NAME,
  resolveChatAssistantAvatarUrl,
  resolveChatAssistantName,
  shouldInvertAssistantAvatar,
} from '@/lib/chatAssistantBranding';

describe('chatAssistantBranding', () => {
  it('falls back to defaults when values are blank', () => {
    expect(resolveChatAssistantName('')).toBe(DEFAULT_CHAT_ASSISTANT_NAME);
    expect(resolveChatAssistantAvatarUrl('')).toBe(DEFAULT_CHAT_ASSISTANT_AVATAR);
  });

  it('preserves custom name and avatar URL', () => {
    expect(resolveChatAssistantName('  Site Coach  ')).toBe('Site Coach');
    expect(resolveChatAssistantAvatarUrl('https://codefrydev.in/images/IconCodefrydev.svg')).toBe(
      'https://codefrydev.in/images/IconCodefrydev.svg',
    );
  });

  it('inverts SVG avatars for the blue badge', () => {
    expect(shouldInvertAssistantAvatar(DEFAULT_CHAT_ASSISTANT_AVATAR)).toBe(true);
    expect(shouldInvertAssistantAvatar('https://codefrydev.in/images/IconCodefrydev.svg')).toBe(true);
    expect(shouldInvertAssistantAvatar('https://example.com/avatar.png')).toBe(false);
  });
});
