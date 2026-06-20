'use client';

import { useState } from 'react';
import ChatShell from '@/components/chat/ChatShell';
import SettingsSidebar, { type SettingsNavId } from '@/components/settings/SettingsSidebar';
import AppearancePanel from '@/components/settings/AppearancePanel';
import LayoutPanel from '@/components/settings/LayoutPanel';
import ChatSettingsPanel from '@/components/settings/ChatSettingsPanel';
import WritingPanel from '@/components/settings/WritingPanel';
import BrandingPanel from '@/components/settings/BrandingPanel';
import DefaultsPanel from '@/components/settings/DefaultsPanel';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsNavId>('appearance');

  function renderSection() {
    switch (activeSection) {
      case 'appearance': return <AppearancePanel />;
      case 'layout': return <LayoutPanel />;
      case 'chat': return <ChatSettingsPanel />;
      case 'writing': return <WritingPanel />;
      case 'branding': return <BrandingPanel />;
      case 'defaults': return <DefaultsPanel />;
    }
  }

  return (
    <ChatShell
      sidebar={(layout) => (
        <SettingsSidebar
          {...layout}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
      )}
    >
      <div className="chat-main-panel">
        <div className="chat-messages-scroll min-h-0 flex-1">
          {renderSection()}
        </div>
      </div>
    </ChatShell>
  );
}
