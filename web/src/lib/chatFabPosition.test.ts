import { describe, expect, it } from 'vitest';
import {
  CHAT_FAB_INSET_PX,
  CHAT_FAB_SIZE_PX,
  didDragFab,
  isChatFabCorner,
  nearestChatFabCorner,
} from './chatFabPosition';

describe('chatFabPosition', () => {
  it('validates stored corners', () => {
    expect(isChatFabCorner('bottom-right')).toBe(true);
    expect(isChatFabCorner('top-left')).toBe(true);
    expect(isChatFabCorner('center')).toBe(false);
  });

  it('picks nearest corner from pointer position', () => {
    expect(nearestChatFabCorner(100, 100, 800, 600)).toBe('top-left');
    expect(nearestChatFabCorner(700, 100, 800, 600)).toBe('top-right');
    expect(nearestChatFabCorner(100, 500, 800, 600)).toBe('bottom-left');
    expect(nearestChatFabCorner(700, 500, 800, 600)).toBe('bottom-right');
  });

  it('detects drag threshold', () => {
    expect(didDragFab(0, 0, 2, 2)).toBe(false);
    expect(didDragFab(0, 0, 10, 0)).toBe(true);
  });

  it('uses consistent fab dimensions', () => {
    expect(CHAT_FAB_SIZE_PX).toBe(56);
    expect(CHAT_FAB_INSET_PX).toBe(24);
  });
});
