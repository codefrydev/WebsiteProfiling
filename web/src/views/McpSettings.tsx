'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, Plug, RefreshCw, Sparkles } from 'lucide-react';
import ConfigField from '@/components/pipeline/ConfigField';
import McpCopyBlock from '@/components/mcp/McpCopyBlock';
import ChatShell from '@/components/chat/ChatShell';
import { SecretsSaveBar } from '@/components/secrets/SecretsSettingsPanel';
import { useMcpSettings } from '@/hooks/useMcpSettings';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { MCP_SETTINGS_FIELDS } from '@/lib/secretsConfigSchema';
import {
  buildDockerStartCommand,
  buildHttpStartCommand,
  buildLocalStdioConfig,
  buildRemoteCursorConfig,
  hostFromPublicUrl,
  normalizeMcpDomain,
  normalizePublicUrl,
  tokenForSnippet,
} from '@/lib/mcpClientConfig';
import { CHAT_SIDEBAR_NAV_IDS, isMiniNavLinkActive, miniNavLinks } from '@/lib/appNav';
import { strings } from '@/lib/strings';

const s = strings.mcpSettings;

const MCP_DOMAIN_OPTIONS = [
  { value: 'core', label: 'core — router + insight (recommended)' },
  { value: 'crawl', label: 'crawl — technical crawl tools' },
  { value: 'google', label: 'google — GSC / GA4 tools' },
  { value: 'links', label: 'links — link architecture' },
  { value: 'full', label: 'full — all 340 tools' },
];

export default function McpSettingsPage() {
  const {
    state,
    envHints,
    loading,
    saving,
    saveMsg,
    loadError,
    setField,
    save,
    generateToken,
    suggestHostsFromUrl,
    tokenMasked,
  } = useMcpSettings();
  const { readOnly } = useReadOnlySession();
  const pathname = usePathname();

  const publicUrl = normalizePublicUrl(String(state.mcp_public_url || ''));
  const domain = normalizeMcpDomain(String(state.mcp_domain || 'core'));
  const snippetToken = tokenForSnippet(String(state.mcp_token || ''), tokenMasked);

  const remoteConfig = buildRemoteCursorConfig({
    publicUrl,
    token: snippetToken,
    domain,
  });

  const localConfig = buildLocalStdioConfig({
    publicUrl,
    token: snippetToken,
    domain,
    propertyId: '1',
  });

  const envHintNames = MCP_SETTINGS_FIELDS.flatMap((field) =>
    (field.envVars ?? []).filter((name) => envHints[name]),
  );

  return (
    <ChatShell
      sidebar={() => (
        <aside className="chat-sidebar flex flex-col">
          <div className="border-b border-muted/30 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.sidebarTitle}</p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {miniNavLinks(CHAT_SIDEBAR_NAV_IDS).map((item) => {
              const active = isMiniNavLinkActive(item.href, pathname);
              return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-blue-500/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/20 hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
              );
            })}
          </nav>
        </aside>
      )}
    >
      <div className="chat-main-panel">
        <header className="chat-context-bar flex items-center gap-3 border-b border-muted/30 bg-[var(--chat-bg)] px-4 py-2.5">
          <Plug className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-bright">{s.pageTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{s.pageSubtitle}</p>
          </div>
        </header>

        <div className="chat-messages-scroll min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {s.loading}
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-red-700 dark:text-red-400">{loadError}</div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
              {envHintNames.length ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
                  {s.envConfigured}: {envHintNames.join(', ')} ({s.envOverrides})
                </div>
              ) : null}

              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{s.accessTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{s.accessSubtitle}</p>
                </div>

                <div className="space-y-4 rounded-2xl border border-muted/30 bg-[var(--chat-surface)] p-5 sm:p-6">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <ConfigField
                        field={{
                          key: 'mcp_token',
                          label: s.tokenLabel,
                          type: 'secret',
                          help: s.tokenHelp,
                          placeholder: s.tokenPlaceholder,
                        }}
                        value={state.mcp_token}
                        disabled={readOnly || saving}
                        onChange={(value) => setField('mcp_token', value)}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={readOnly || saving}
                      onClick={generateToken}
                      className="inline-flex items-center gap-1.5 rounded-full border border-default/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-blue-500/30 hover:bg-blue-500/5 disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      {s.generateToken}
                    </button>
                  </div>

                  <ConfigField
                    field={{
                      key: 'mcp_public_url',
                      label: s.publicUrlLabel,
                      type: 'text',
                      help: s.publicUrlHelp,
                      placeholder: 'https://audit.example.com',
                    }}
                    value={state.mcp_public_url}
                    disabled={readOnly || saving}
                    onChange={(value) => setField('mcp_public_url', value)}
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={readOnly || saving || !publicUrl}
                      onClick={suggestHostsFromUrl}
                      className="inline-flex items-center gap-1.5 rounded-full border border-default/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      {s.syncHosts}
                    </button>
                    {publicUrl ? (
                      <span className="text-xs text-muted-foreground">
                        {s.endpointPreview}: <code className="text-foreground">{publicUrl}/mcp</code>
                      </span>
                    ) : null}
                  </div>

                  <ConfigField
                    field={{
                      key: 'mcp_allowed_hosts',
                      label: s.allowedHostsLabel,
                      type: 'text',
                      help: s.allowedHostsHelp,
                      placeholder: hostFromPublicUrl(publicUrl) || 'audit.example.com',
                    }}
                    value={state.mcp_allowed_hosts}
                    disabled={readOnly || saving}
                    onChange={(value) => setField('mcp_allowed_hosts', value)}
                  />

                  <ConfigField
                    field={{
                      key: 'mcp_allowed_origins',
                      label: s.allowedOriginsLabel,
                      type: 'text',
                      help: s.allowedOriginsHelp,
                      placeholder: publicUrl || 'https://audit.example.com',
                    }}
                    value={state.mcp_allowed_origins}
                    disabled={readOnly || saving}
                    onChange={(value) => setField('mcp_allowed_origins', value)}
                  />

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">{s.domainLabel}</span>
                    <p className="text-xs leading-relaxed text-muted-foreground">{s.domainHelp}</p>
                    <select
                      value={domain}
                      disabled={readOnly || saving}
                      onChange={(e) => setField('mcp_domain', e.target.value)}
                      className="w-full rounded-lg border border-default bg-[var(--chat-bg)] px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none"
                    >
                      {MCP_DOMAIN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{s.copyTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{s.copySubtitle}</p>
                </div>

                <McpCopyBlock
                  label={s.remoteConfigLabel}
                  description={s.remoteConfigHelp}
                  value={remoteConfig}
                />
                <McpCopyBlock
                  label={s.localConfigLabel}
                  description={s.localConfigHelp}
                  value={localConfig}
                />
                <McpCopyBlock
                  label={s.startHttpLabel}
                  description={s.startHttpHelp}
                  value={buildHttpStartCommand()}
                  language="shell"
                />
                <McpCopyBlock
                  label={s.startDockerLabel}
                  description={s.startDockerHelp}
                  value={buildDockerStartCommand()}
                  language="shell"
                />
              </section>

              <p className="text-xs text-muted-foreground">
                {s.docsHint}{' '}
                <a
                  href="https://github.com/codefrydev/WebsiteProfiling/blob/master/docs/MCP.md#remote-streamable-http"
                  className="text-link hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.docsLink}
                </a>
              </p>
            </div>
          )}
        </div>

        <footer className="chat-composer-dock shrink-0">
          <SecretsSaveBar
            saving={saving}
            loading={loading}
            saveMsg={saveMsg}
            readOnly={readOnly}
            onSave={() => void save()}
            saveHint={s.saveHint}
            saveButton={s.saveButton}
            savingLabel={s.saving}
          />
        </footer>
      </div>
    </ChatShell>
  );
}
