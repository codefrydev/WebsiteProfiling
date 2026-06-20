export const DEFAULT_CHAT_ASSISTANT_NAME = 'AI Assistant';
export const DEFAULT_CHAT_ASSISTANT_AVATAR = '/logo.svg';

export function resolveChatAssistantName(value: string | undefined): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || DEFAULT_CHAT_ASSISTANT_NAME;
}

export function resolveChatAssistantAvatarUrl(value: string | undefined): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || DEFAULT_CHAT_ASSISTANT_AVATAR;
}

/** Black SVG marks need inversion on the blue avatar circle. */
export function shouldInvertAssistantAvatar(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed === DEFAULT_CHAT_ASSISTANT_AVATAR) return true;
  try {
    const path = trimmed.startsWith('http') ? new URL(trimmed).pathname : trimmed;
    return path.toLowerCase().endsWith('.svg');
  } catch {
    return trimmed.toLowerCase().endsWith('.svg');
  }
}
