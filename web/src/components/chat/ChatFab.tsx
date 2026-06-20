'use client';

import { MessageSquare, X } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { isChatFabVisiblePath } from '@/lib/chatUrlState';
import { strings } from '@/lib/strings';
import ChatFabDrawer from '@/components/chat/ChatFabDrawer';

const s = strings.components.chat;

/**
 * Floating AI chat button — opens an inline popup on the current page.
 * Drag to any screen corner; position is remembered across sessions.
 */
export default function ChatFab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain') ?? searchParams.get('brand');

  const [open, setOpen] = useState(false);
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
    setOpen((v) => !v);
  }, []);

  if (!isChatFabVisiblePath(pathname)) {
    return null;
  }

  const style: CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto' }
    : chatFabCornerStyle(corner);

  return (
    <>
      {/* Hide the FAB while the drawer is open — drawer has its own close button */}
      {!open && (
        <button
          type="button"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          style={style}
          className={`print:hidden fixed z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--elevation-2)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] touch-none select-none ${
            isDragging ? 'cursor-grabbing scale-105 transition-none' : 'cursor-grab transition-all duration-200 ease-out'
          }`}
          aria-label={s.fabAria}
          title={s.fabDragTitle}
        >
          <MessageSquare className="h-7 w-7 pointer-events-none" aria-hidden />
        </button>
      )}

      <ChatFabDrawer open={open} domain={domain} onClose={() => setOpen(false)} />
    </>
  );
}
