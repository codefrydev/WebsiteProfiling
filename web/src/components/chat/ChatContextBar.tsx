
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
    <header className="chat-context-bar flex items-center gap-3 border-b border-md-sys-outline-variant/30 bg-md-sys-surface px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-md-sys-on-surface" title={domainLabel}>
            {loading && !property ? c.loadingProperty : domainLabel}
          </p>
          {sessionTitle ? (
            <p className="truncate text-xs text-md-sys-on-surface-variant" title={sessionTitle}>
              {sessionTitle}
            </p>
          ) : null}
        </div>
      </div>
      {crawlActionsEnabled ? (
        <span className="shrink-0 rounded-full border border-md-sys-primary/30 bg-md-sys-primary-container/40 px-2.5 py-0.5 text-[10px] font-medium text-md-sys-on-primary-container">
          {c.crawlActionsEnabled}
        </span>
      ) : null}
    </header>
  );
}
