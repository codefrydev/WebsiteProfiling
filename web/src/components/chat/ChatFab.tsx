'use client';

import { MessageSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  chatFabCornerStyle,
  didDragFab,
  loadChatFabCorner,
  nearestChatFabCorner,
  pointerPositionFromFabCenter,
  saveChatFabCorner,
  type ChatFabCorner,
} from '@/lib/chatFabPosition';
import { buildChatFabHref, isChatFabVisiblePath } from '@/lib/chatUrlState';
import { strings } from '@/lib/strings';

const s = strings.components.chat;

/**
 * Floating entry to AI chat from domain-scoped report views (e.g. /dashboard?domain=…).
 * Drag to any screen corner; position is remembered across sessions.
 */
export default function ChatFab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain') ?? searchParams.get('brand');

  const [corner, setCorner] = useState<ChatFabCorner>('bottom-right');
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setCorner(loadChatFabCorner());
    return () => cleanupRef.current?.();
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    cleanupRef.current?.();

    const start = { x: event.clientX, y: event.clientY };
    dragStartRef.current = start;
    isDraggingRef.current = false;
    suppressClickRef.current = false;

    const handleMove = (ev: PointerEvent) => {
      if (!dragStartRef.current) return;

      if (!isDraggingRef.current) {
        if (!didDragFab(start.x, start.y, ev.clientX, ev.clientY)) return;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      setDragPos(pointerPositionFromFabCenter(ev.clientX, ev.clientY));
    };

    const finish = (ev: PointerEvent) => {
      cleanupListeners();

      if (!dragStartRef.current) return;

      if (isDraggingRef.current) {
        const nextCorner = nearestChatFabCorner(ev.clientX, ev.clientY);
        setCorner(nextCorner);
        saveChatFabCorner(nextCorner);
        suppressClickRef.current = true;
      }

      dragStartRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
      setDragPos(null);
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanupListeners;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, []);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    router.push(buildChatFabHref(domain));
  }, [router, domain]);

  if (!isChatFabVisiblePath(pathname)) {
    return null;
  }

  const style: CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto' }
    : chatFabCornerStyle(corner);

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      style={style}
      className={`print:hidden fixed z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] touch-none select-none ${
        isDragging ? 'cursor-grabbing scale-105 transition-none' : 'cursor-grab transition-all duration-200 ease-out'
      }`}
      aria-label={s.fabAria}
      title={s.fabDragTitle}
    >
      <MessageSquare className="h-7 w-7 pointer-events-none" aria-hidden />
    </button>
  );
}
