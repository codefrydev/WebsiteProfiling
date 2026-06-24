
import type { ReactNode } from 'react';
import ChatShell from '@/components/chat/ChatShell';
import DocsContextBar from '@/components/docs/DocsContextBar';
import DocsSidebar from '@/components/docs/DocsSidebar';
import type { IntegrationGuideSlug } from '@/lib/docs/integrationGuides';
import { strings } from '@/lib/strings';

const d = strings.docs;

export interface DocsShellProps {
  children: ReactNode;
  activeGuideSlug?: IntegrationGuideSlug;
  headerTitle?: string;
  headerSubtitle?: string;
}

export default function DocsShell({
  children,
  activeGuideSlug,
  headerTitle,
  headerSubtitle,
}: DocsShellProps) {
  return (
    <ChatShell
      sidebar={(layout) => (
        <DocsSidebar {...layout} activeGuideSlug={activeGuideSlug} />
      )}
    >
      <div className="chat-main-panel">
        <DocsContextBar
          title={headerTitle ?? d.pageTitle}
          subtitle={headerSubtitle ?? d.pageSubtitle}
        />
        <div className="chat-messages-scroll flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </ChatShell>
  );
}
