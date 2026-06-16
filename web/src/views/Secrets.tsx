'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import ChatShell from '@/components/chat/ChatShell';
import SecretsContextBar from '@/components/secrets/SecretsContextBar';
import SecretsSidebar from '@/components/secrets/SecretsSidebar';
import SecretsSettingsPanel, { SecretsSaveBar } from '@/components/secrets/SecretsSettingsPanel';
import { useSecrets } from '@/hooks/useSecrets';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { SECRETS_SECTIONS, type SecretsNavId } from '@/lib/secretsConfigSchema';
import { strings } from '@/lib/strings';

const s = strings.secrets;

export default function SecretsPage() {
  const [activeSection, setActiveSection] = useState<SecretsNavId>(SECRETS_SECTIONS[0].id);
  const { state, envHints, loading, saving, saveMsg, loadError, setField, save } = useSecrets();
  const { readOnly } = useReadOnlySession();

  return (
    <ChatShell
      sidebar={(layout) => (
        <SecretsSidebar
          {...layout}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
      )}
    >
      <div className="chat-main-panel">
        <SecretsContextBar activeSection={activeSection} />

        <div className="chat-messages-scroll min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {s.loading}
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-red-700 dark:text-red-400">
              {loadError}
            </div>
          ) : (
            <SecretsSettingsPanel
              activeSection={activeSection}
              state={state}
              envHints={envHints}
              disabled={readOnly || saving}
              onChange={setField}
            />
          )}
        </div>

        <footer className="chat-composer-dock shrink-0">
          <SecretsSaveBar
            saving={saving}
            loading={loading}
            saveMsg={saveMsg}
            readOnly={readOnly}
            onSave={() => void save()}
          />
        </footer>
      </div>
    </ChatShell>
  );
}
