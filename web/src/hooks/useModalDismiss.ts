import { useEffect } from 'react';

export interface UseModalDismissOptions {
  onDismiss: () => void;
  enabled?: boolean;
  lockScroll?: boolean;
}

/**
 * Checks if a key event represents an Escape dismiss.
 */
export function isEscapeKey(event: { key: string }): boolean {
  return event.key === 'Escape';
}

/**
 * Handles Escape key dismissal and optional background scroll locking
 * for modal dialogs and slide-over drawers.
 */
export function useModalDismiss({
  onDismiss,
  enabled = true,
  lockScroll = true,
}: UseModalDismissOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEscapeKey(event)) {
        event.stopPropagation();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    let prevOverflow: string | undefined;
    if (lockScroll && typeof document !== 'undefined') {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (lockScroll && typeof document !== 'undefined' && prevOverflow !== undefined) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [enabled, lockScroll, onDismiss]);
}
