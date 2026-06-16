'use client';

import { useCallback, useState, type ReactNode } from 'react';

export interface WriteLayoutState {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (value: boolean) => void;
}

export interface WriteStudioShellProps {
  sidebar: (layout: WriteLayoutState) => ReactNode;
  seoPanel?: ReactNode;
  children: ReactNode | ((layout: WriteLayoutState) => ReactNode);
}

/** Full-viewport writing layout — mirrors ChatShell: rail sidebar | editor | optional SEO rail. */
export default function WriteStudioShell({ sidebar, seoPanel, children }: WriteStudioShellProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  const layout: WriteLayoutState = {
    expanded,
    toggle,
    setExpanded,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--chat-bg)] text-foreground">
      {sidebar(layout)}

      <main className="chat-shell-main min-w-0 flex flex-1">
        <div className="chat-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {typeof children === 'function' ? children(layout) : children}
          </div>
          {seoPanel ? (
            <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-muted/30 bg-[var(--chat-surface)] xl:block">
              <div className="p-4">{seoPanel}</div>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
