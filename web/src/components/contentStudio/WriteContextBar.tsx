
import { Globe } from 'lucide-react';
import { formatChatPropertyLabel } from '@/lib/chatPropertyLabel';
import { strings } from '@/lib/strings';
import type { WritePropertyOption } from '@/components/contentStudio/WriteStudioSidebar';

const s = strings.views.contentStudio.shell;

export interface WriteContextBarProps {
  property: WritePropertyOption | null;
  propertyId: number | null;
  draftTitle?: string | null;
  loading?: boolean;
}

export default function WriteContextBar({
  property,
  propertyId,
  draftTitle,
  loading,
}: WriteContextBarProps) {
  const domainLabel = property
    ? formatChatPropertyLabel(property)
    : propertyId
      ? `#${propertyId}`
      : s.noProperties;

  return (
    <header className="chat-context-bar flex items-center gap-3 border-b border-md-sys-outline-variant/30 bg-md-sys-surface px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-md-sys-on-surface" title={domainLabel}>
            {loading && !property ? strings.components.chat.loadingProperty : domainLabel}
          </p>
          {draftTitle ? (
            <p className="truncate text-xs text-md-sys-on-surface-variant" title={draftTitle}>
              {draftTitle}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
