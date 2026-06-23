
import { Globe } from 'lucide-react';
import { formatChatPropertyLabel } from '@/lib/chatPropertyLabel';
import { strings } from '@/lib/strings';
import type { PropertyOption } from '@/components/chat/ChatSidebar';

const c = strings.components.chat;

export interface ChatContextBarProps {
  property: PropertyOption | null;
  propertyId: number | null;
  sessionTitle?: string | null;
  loading?: boolean;
  crawlActionsEnabled?: boolean;
}

export default function ChatContextBar({
  property,
  propertyId,
  sessionTitle,
  loading,
  crawlActionsEnabled,
}: ChatContextBarProps) {
  const domainLabel = property
    ? formatChatPropertyLabel(property)
    : propertyId
      ? `#${propertyId}`
      : c.noProperties;

  return (
    <header className="chat-context-bar flex items-center gap-3 border-b border-muted/30 bg-[var(--chat-bg)] px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bright" title={domainLabel}>
            {loading && !property ? c.loadingProperty : domainLabel}
          </p>
          {sessionTitle ? (
            <p className="truncate text-xs text-muted-foreground" title={sessionTitle}>
              {sessionTitle}
            </p>
          ) : null}
        </div>
      </div>
      {crawlActionsEnabled ? (
        <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
          {c.crawlActionsEnabled}
        </span>
      ) : null}
    </header>
  );
}
