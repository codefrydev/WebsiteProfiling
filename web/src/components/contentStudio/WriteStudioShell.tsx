'use client';

import type { ReactNode } from 'react';

export interface WriteStudioShellProps {
  sidebar: ReactNode;
  seoPanel?: ReactNode;
  children: ReactNode;
}

/** Full-viewport writing layout: drafts sidebar | editor | optional SEO rail. */
export default function WriteStudioShell({ sidebar, seoPanel, children }: WriteStudioShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-brand-900 text-foreground">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {seoPanel ? (
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-default bg-brand-950/50 xl:block">
          <div className="p-4">{seoPanel}</div>
        </aside>
      ) : null}
    </div>
  );
}
