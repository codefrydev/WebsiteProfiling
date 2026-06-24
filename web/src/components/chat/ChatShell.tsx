
import { useCallback, useState, type ReactNode } from 'react';

export interface ChatLayoutState {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (value: boolean) => void;
}

export interface ChatShellProps {
  sidebar: (layout: ChatLayoutState) => ReactNode;
  children: ReactNode | ((layout: ChatLayoutState) => ReactNode);
}

export default function ChatShell({ sidebar, children }: ChatShellProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  const layout: ChatLayoutState = {
    expanded,
    toggle,
    setExpanded,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--chat-bg)] text-foreground">
      {sidebar(layout)}

      <main className="chat-shell-main min-w-0">
        <div className="chat-glow pointer-events-none absolute inset-0" aria-hidden />
        {typeof children === 'function' ? children(layout) : children}
      </main>
    </div>
  );
}
