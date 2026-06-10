import type { CSSProperties } from 'react';

export type ChatFabCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const STORAGE_KEY = 'wp-chat-fab-position:v1';
export const CHAT_FAB_SIZE_PX = 56;
export const CHAT_FAB_INSET_PX = 24;
const DRAG_THRESHOLD_PX = 4;

const VALID_CORNERS: ChatFabCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

export function isChatFabCorner(value: unknown): value is ChatFabCorner {
  return typeof value === 'string' && (VALID_CORNERS as string[]).includes(value);
}

export function loadChatFabCorner(defaultCorner: ChatFabCorner = 'bottom-right'): ChatFabCorner {
  if (typeof window === 'undefined') return defaultCorner;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCorner;
    const parsed = JSON.parse(raw) as { corner?: unknown };
    return isChatFabCorner(parsed.corner) ? parsed.corner : defaultCorner;
  } catch {
    return defaultCorner;
  }
}

export function saveChatFabCorner(corner: ChatFabCorner): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ corner }));
  } catch {
    /* quota / private mode */
  }
}

export function chatFabCornerStyle(corner: ChatFabCorner): CSSProperties {
  switch (corner) {
    case 'bottom-left':
      return { bottom: CHAT_FAB_INSET_PX, left: CHAT_FAB_INSET_PX };
    case 'top-right':
      return { top: CHAT_FAB_INSET_PX, right: CHAT_FAB_INSET_PX };
    case 'top-left':
      return { top: CHAT_FAB_INSET_PX, left: CHAT_FAB_INSET_PX };
    default:
      return { bottom: CHAT_FAB_INSET_PX, right: CHAT_FAB_INSET_PX };
  }
}

export function clampChatFabPosition(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(
    CHAT_FAB_INSET_PX,
    window.innerWidth - CHAT_FAB_SIZE_PX - CHAT_FAB_INSET_PX,
  );
  const maxY = Math.max(
    CHAT_FAB_INSET_PX,
    window.innerHeight - CHAT_FAB_SIZE_PX - CHAT_FAB_INSET_PX,
  );
  return {
    x: Math.min(Math.max(x, CHAT_FAB_INSET_PX), maxX),
    y: Math.min(Math.max(y, CHAT_FAB_INSET_PX), maxY),
  };
}

export function nearestChatFabCorner(
  centerX: number,
  centerY: number,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): ChatFabCorner {
  const isLeft = centerX < viewportWidth / 2;
  const isTop = centerY < viewportHeight / 2;
  if (isTop && isLeft) return 'top-left';
  if (isTop && !isLeft) return 'top-right';
  if (!isTop && isLeft) return 'bottom-left';
  return 'bottom-right';
}

export function pointerPositionFromFabCenter(
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  return clampChatFabPosition(
    centerX - CHAT_FAB_SIZE_PX / 2,
    centerY - CHAT_FAB_SIZE_PX / 2,
  );
}

export function didDragFab(startX: number, startY: number, x: number, y: number): boolean {
  return Math.hypot(x - startX, y - startY) >= DRAG_THRESHOLD_PX;
}
