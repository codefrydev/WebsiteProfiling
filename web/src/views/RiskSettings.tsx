
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import ChatShell from '@/components/chat/ChatShell';
import { SecretsSaveBar } from '@/components/secrets/SecretsSettingsPanel';
import ToolPageSidebar from '@/components/shared/ToolPageSidebar';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useSession } from '@/context/SessionContext';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { RISK_SETTINGS_SIDEBAR_NAV_IDS } from '@/lib/appNav';

// ─── Types ────────────────────────────────────────────────────────────────────

interface McpTool {
  name: string;
  description: string;
  domain: string;
  bundles: string[];
  enabled?: boolean;
}

interface McpCatalog {
  tools: McpTool[];
  bundles: Record<string, string[]>;
  domains: string[];
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MCP_DOMAIN_OPTIONS = [
  { value: 'core', label: 'Core', description: 'Router + insight tools (recommended)' },
  { value: 'crawl', label: 'Crawl', description: 'Technical crawl & on-page tools' },
  { value: 'google', label: 'Google', description: 'GSC / GA4 / keyword tools' },
  { value: 'links', label: 'Links', description: 'Link architecture & backlinks' },
  { value: 'custom', label: 'Custom', description: 'Pick individual tool domains below' },
  { value: 'full', label: 'Full Access ⚠️', description: 'All 340+ tools — high risk' },
] as const;

const FEATURE_ITEMS = [
  { id: 'pipeline', label: 'Pipeline / Run Audit', description: 'Crawl sites and build reports' },
  { id: 'write', label: 'Write Studio', description: 'AI-assisted content generation' },
  { id: 'pages-md', label: 'Page Markdown', description: 'Extract per-page markdown' },
  { id: 'chat', label: 'AI Chat', description: 'Ask questions about audit data' },
  { id: 'mcp', label: 'MCP Settings', description: 'Remote MCP client configuration' },
  { id: 'secrets', label: 'Secrets', description: 'API keys and credentials page' },
] as const;

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`press relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-md-sys-primary border-md-sys-primary' : 'bg-md-sys-surface-container-highest border-md-sys-outline'
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none block h-5 w-5 rounded-full shadow-xs ring-0 transition-transform ${
          checked ? 'translate-x-5 bg-md-sys-on-primary' : 'translate-x-0 bg-md-sys-outline'
        }`}
      />
    </button>
  );
}

// ─── Row wrapper ──────────────────────────────────────────────────────────────

function Row({
  label,
  help,
  htmlFor,
  children,
  dimmed,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-6 px-5 py-4 ${dimmed ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block cursor-pointer text-sm font-medium text-md-sys-on-surface"
        >
          {label}
        </label>
        {help && <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{help}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-md-sys-on-surface">{title}</h2>
      <p className="mt-1 text-sm text-md-sys-on-surface-variant">{subtitle}</p>
    </div>
  );
}

// ─── MCP Domain Selector ──────────────────────────────────────────────────────

function DomainSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {MCP_DOMAIN_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const isFull = opt.value === 'full';
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`press flex flex-col items-start rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? isFull
                  ? 'border-md-sys-tertiary/60 bg-md-sys-tertiary-container/30'
                  : 'border-md-sys-primary bg-md-sys-primary/10'
                : 'border-md-sys-outline-variant/40 hover:border-md-sys-primary/50 hover:bg-md-sys-surface-container-high'
            }`}
          >
            <span
              className={`text-xs font-semibold ${
                active ? (isFull ? 'text-md-sys-on-tertiary-container' : 'text-md-sys-primary') : 'text-md-sys-on-surface'
              }`}
            >
              {opt.label}
            </span>
            <span className="mt-0.5 text-[11px] text-md-sys-on-surface-variant">{opt.description}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Custom domain toggles ────────────────────────────────────────────────────

function CustomDomainPicker({
  domains,
  enabledDomains,
  onToggle,
  disabled,
}: {
  domains: string[];
  enabledDomains: Set<string>;
  onToggle: (domain: string, enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {domains.map((domain) => {
        const checked = enabledDomains.has(domain);
        return (
          <label
            key={domain}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm capitalize transition-all ${
              checked
                ? 'border-md-sys-primary/40 bg-md-sys-primary/10 text-md-sys-primary font-medium'
                : 'border-md-sys-outline-variant/40 bg-md-sys-surface-container-lowest text-md-sys-on-surface'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            <input
              type="checkbox"
              className="rounded border-md-sys-outline-variant/40"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onToggle(domain, e.target.checked)}
            />
            <span className="text-md-sys-on-surface">{domain}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Per-tool accordion ───────────────────────────────────────────────────────

function ToolDomainAccordion({
  domain,
  tools,
  disabledTools,
  onToggle,
  currentBundle,
  enabledDomains,
  disabled,
}: {
  domain: string;
  tools: McpTool[];
  disabledTools: Set<string>;
  onToggle: (name: string, disabled: boolean) => void;
  currentBundle: string;
  enabledDomains: Set<string>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const inBundle =
    currentBundle === 'full'
    || tools.some((t) => t.bundles.includes(currentBundle))
    || (currentBundle === 'custom' && enabledDomains.has(domain));
  const bundleTools = tools.filter((t) =>
    currentBundle === 'full'
    || t.bundles.includes(currentBundle)
    || (currentBundle === 'custom' && enabledDomains.has(domain)));
  const enabledCount = tools.filter((t) => !disabledTools.has(t.name)).length;

  return (
    <div className="rounded-xl border border-md-sys-outline-variant/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex min-w-0 items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" />
          )}
          <span className="font-medium text-sm text-md-sys-on-surface capitalize">{domain}</span>
          <span className="text-xs text-md-sys-on-surface-variant">
            {enabledCount}/{tools.length} enabled
          </span>
          {bundleTools.length > 0 && (
            <span className="rounded-full bg-md-sys-primary/10 px-2 py-0.5 text-[10px] font-medium text-md-sys-primary">
              in bundle
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-md-sys-outline-variant/40 border-t border-md-sys-outline-variant/40">
          {tools.map((tool) => {
            const isDisabled = disabledTools.has(tool.name);
            const inToolBundle =
              currentBundle === 'full'
              || tool.bundles.includes(currentBundle)
              || (currentBundle === 'custom' && enabledDomains.has(domain));
            return (
              <div
                key={tool.name}
                className={`flex items-start justify-between gap-4 px-4 py-3 ${!inToolBundle ? 'opacity-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-medium text-md-sys-on-surface">{tool.name}</p>
                  {tool.description && (
                    <p className="mt-0.5 text-[11px] text-md-sys-on-surface-variant line-clamp-2">
                      {tool.description}
                    </p>
                  )}
                  {!inToolBundle && (
                    <p className="mt-0.5 text-[10px] text-md-sys-warning">
                      Not in current bundle — enable the &ldquo;{domain}&rdquo; domain or switch bundle
                    </p>
                  )}
                </div>
                <Toggle
                  id={`tool-${tool.name}`}
                  checked={!isDisabled}
                  onChange={(enabled) => onToggle(tool.name, !enabled)}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string | null }) {
  const colors: Record<string, string> = {
    admin: 'bg-md-sys-tertiary-container text-md-sys-on-tertiary-container',
    analyst: 'bg-md-sys-info-container text-md-sys-on-info-container',
    editor: 'bg-md-sys-success-container text-md-sys-on-success-container',
    viewer: 'bg-md-sys-warning-container text-md-sys-on-warning-container',
    'client-readonly': 'bg-md-sys-surface-container-highest text-md-sys-on-surface-variant',
  };
  const cls = role ? (colors[role] ?? 'bg-md-sys-surface-container-high/40 text-md-sys-on-surface-variant') : 'bg-md-sys-surface-container-high/40 text-md-sys-on-surface-variant';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {role ?? 'none'}
    </span>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function RiskSettingsPage() {
  const {
    state,
    loading,
    saving,
    saveMsg,
    loadError,
    setField,
    save,
    disabledTools,
    setToolDisabled,
    enabledDomains,
    setDomainEnabled,
    featureEnabled,
    setFeatureEnabled,
    llmState,
    llmSaveStatus,
    setLlmField,
  } = useRiskSettings();

  const session = useSession();

  const [catalog, setCatalog] = useState<McpCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    void apiFetch(apiUrl('/mcp-tools'))
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as McpCatalog & { error?: string; detail?: string };
        if (!res.ok) {
          setCatalogError(data.error || data.detail || `Failed to load MCP catalog (${res.status})`);
          return;
        }
        if (data.error) {
          setCatalogError(data.error);
        } else {
          setCatalog(data);
        }
      })
      .catch((e: unknown) => setCatalogError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCatalogLoading(false));
  }, []);

  const currentDomain = String(state.mcp_domain || 'core');

  // Group tools by domain
  const toolsByDomain: Record<string, McpTool[]> = {};
  for (const tool of catalog?.tools ?? []) {
    if (!toolsByDomain[tool.domain]) toolsByDomain[tool.domain] = [];
    toolsByDomain[tool.domain].push(tool);
  }
  const domainOrder = catalog?.domains ?? Object.keys(toolsByDomain);

  return (
    <ChatShell
      sidebar={(layout) => (
        <ToolPageSidebar
          {...layout}
          navIds={RISK_SETTINGS_SIDEBAR_NAV_IDS}
          title="Risk Settings"
          railIcon={ShieldCheck}
        />
      )}
    >
      <div className="chat-main-panel">
        {/* Header */}
        <header className="chat-context-bar flex items-center gap-3 border-b border-md-sys-outline-variant/30 bg-md-sys-surface px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-md-sys-on-surface">Risk Settings</p>
            <p className="truncate text-xs text-md-sys-on-surface-variant">
              Access modes, per-tool controls & feature visibility
            </p>
          </div>
        </header>

        <div className="chat-messages-scroll min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-md-sys-on-surface-variant">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading settings…
            </div>
          ) : loadError ? (
            <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-md-sys-error">
              {loadError}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">

              {/* Warning callout */}
              <div className="flex gap-3 rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/30 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-md-sys-warning" aria-hidden />
                <p className="text-xs text-md-sys-on-warning-container">
                  Changes here affect what MCP clients can access, which AI capabilities are active,
                  and which features are visible. Enabling full access exposes all audit tools to
                  connected MCP clients.
                </p>
              </div>

              {/* ── Section 1: MCP Access ─────────────────────────────────── */}
              <section className="space-y-4">
                <SectionHeader
                  title="MCP Tool Access"
                  subtitle="Control which audit tools are exposed to connected MCP clients (Claude Desktop, Cursor, etc.)."
                />

                {/* Domain bundle */}
                <div className="space-y-3 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-5">
                  <div>
                    <p className="text-sm font-medium text-md-sys-on-surface">Domain bundle</p>
                    <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">
                      Determines which tool groups are exposed. &ldquo;Full&rdquo; exposes all 340+ tools.
                    </p>
                  </div>
                  <DomainSelector
                    value={currentDomain}
                    onChange={(v) => setField('mcp_domain', v)}
                    disabled={saving}
                  />
                  {currentDomain === 'full' && (
                    <p className="text-xs text-md-sys-warning">
                      ⚠️ Full mode exposes every tool to MCP clients — use a strong bearer token.
                    </p>
                  )}
                  {currentDomain === 'custom' && (
                    <div className="space-y-2 border-t border-md-sys-outline-variant/40 pt-4">
                      <p className="text-xs font-medium text-md-sys-on-surface">Enabled tool domains</p>
                      <p className="text-xs text-md-sys-on-surface-variant">
                        Choose which audit tool groups are active for MCP and in-app chat.
                      </p>
                      <CustomDomainPicker
                        domains={domainOrder.length ? domainOrder : (catalog?.domains ?? [])}
                        enabledDomains={enabledDomains}
                        onToggle={setDomainEnabled}
                        disabled={saving}
                      />
                    </div>
                  )}
                </div>

                {/* Per-tool toggles */}
                <div className="space-y-3 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-5">
                  <div>
                    <p className="text-sm font-medium text-md-sys-on-surface">Per-tool control</p>
                    <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">
                      Disable individual tools even within the selected bundle. Tools not in the current
                      bundle are dimmed — switch to &ldquo;full&rdquo; to activate them.
                    </p>
                  </div>

                  {catalogLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-md-sys-on-surface-variant">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading tool catalog…
                    </div>
                  ) : catalogError ? (
                    <div className="rounded-2xl border border-md-sys-error/30 bg-md-sys-error-container/30 px-4 py-3 text-xs text-md-sys-on-error-container">
                      Could not load tool catalog: {catalogError}
                      <br />
                      Make sure Python is available and the virtual environment is activated.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {domainOrder
                        .filter((d) => toolsByDomain[d]?.length)
                        .map((domain) => (
                          <ToolDomainAccordion
                            key={domain}
                            domain={domain}
                            tools={toolsByDomain[domain]}
                            disabledTools={disabledTools}
                            onToggle={setToolDisabled}
                            currentBundle={currentDomain}
                            enabledDomains={enabledDomains}
                            disabled={saving}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </section>

              {/* ── Section 2: AI Access ──────────────────────────────────── */}
              <section className="space-y-4">
                <SectionHeader
                  title="AI / LLM Access"
                  subtitle="Control which AI capabilities are active. Changes save immediately."
                />

                <div className="rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container divide-y divide-md-sys-outline-variant/40">
                  <div className="px-5 py-3 flex items-center justify-between">
                    <p className="text-xs font-medium text-md-sys-on-surface-variant uppercase tracking-wide">Setting</p>
                    <div className="flex items-center gap-2">
                      {llmSaveStatus === 'saving' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-md-sys-on-surface-variant" />
                      )}
                      {llmSaveStatus === 'saved' && (
                        <span className="text-xs text-md-sys-primary">Saved</span>
                      )}
                      {llmSaveStatus === 'error' && (
                        <span className="text-xs text-md-sys-error">Error saving</span>
                      )}
                    </div>
                  </div>

                  <Row
                    htmlFor="llm-enabled"
                    label="AI features enabled"
                    help="Master toggle. When off, chat, write studio and all AI-powered tools are disabled."
                  >
                    <Toggle
                      id="llm-enabled"
                      checked={llmState.llm_enabled}
                      onChange={(v) => setLlmField('llm_enabled', v)}
                      disabled={llmSaveStatus === 'saving'}
                    />
                  </Row>

                  <Row
                    htmlFor="llm-write"
                    label="AI write access"
                    help="Allow AI to generate and suggest content in Write Studio. Disable to make AI read-only."
                    dimmed={!llmState.llm_enabled}
                  >
                    <Toggle
                      id="llm-write"
                      checked={llmState.llm_write_enabled}
                      onChange={(v) => setLlmField('llm_write_enabled', v)}
                      disabled={!llmState.llm_enabled || llmSaveStatus === 'saving'}
                    />
                  </Row>

                  <Row
                    htmlFor="llm-chat-readonly"
                    label="Allow read-only users to chat"
                    help="When enabled, users with the 'client-readonly' role can access AI chat. 'viewer' role is always blocked."
                    dimmed={!llmState.llm_enabled}
                  >
                    <Toggle
                      id="llm-chat-readonly"
                      checked={llmState.llm_chat_allow_client_readonly}
                      onChange={(v) => setLlmField('llm_chat_allow_client_readonly', v)}
                      disabled={!llmState.llm_enabled || llmSaveStatus === 'saving'}
                    />
                  </Row>
                </div>
              </section>

              {/* ── Section 3: Feature Visibility ────────────────────────── */}
              <section className="space-y-4">
                <SectionHeader
                  title="Feature Visibility"
                  subtitle="Show or hide app features in the navigation. Hidden features are not accessible by URL either — this takes effect after the next page load."
                />

                <div className="rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container divide-y divide-md-sys-outline-variant/40">
                  {FEATURE_ITEMS.map((item) => (
                    <Row
                      key={item.id}
                      htmlFor={`feature-${item.id}`}
                      label={item.label}
                      help={item.description}
                    >
                      <Toggle
                        id={`feature-${item.id}`}
                        checked={featureEnabled(item.id)}
                        onChange={(v) => setFeatureEnabled(item.id, v)}
                        disabled={saving}
                      />
                    </Row>
                  ))}
                </div>
                <p className="text-[11px] text-md-sys-on-surface-variant">
                  Feature visibility is saved to the database and applies to all browsers accessing this instance.
                </p>
              </section>

              {/* ── Section 4: Session & Auth Info ───────────────────────── */}
              <section className="space-y-4">
                <SectionHeader
                  title="Session & Auth"
                  subtitle="Current session information and authentication configuration. Read-only — set via environment variables."
                />

                <div className="rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container divide-y divide-md-sys-outline-variant/40">
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-md-sys-on-surface">Auth system</p>
                      <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">
                        Controlled by <code className="font-mono">AUTH_SECRET</code> environment variable
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        session.authEnabled
                          ? 'bg-md-sys-success-container text-md-sys-on-success-container'
                          : 'bg-md-sys-surface-container-high/40 text-md-sys-on-surface-variant'
                      }`}
                    >
                      {session.authEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-md-sys-on-surface">Current role</p>
                      <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">
                        Set via <code className="font-mono">AUTH_DEFAULT_ROLE</code> or session token
                      </p>
                    </div>
                    <RoleBadge role={session.role} />
                  </div>

                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-md-sys-on-surface">Mutation access</p>
                      <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">
                        Roles <code className="font-mono">analyst</code>,{' '}
                        <code className="font-mono">editor</code>,{' '}
                        <code className="font-mono">admin</code> can mutate
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        session.canMutate
                          ? 'bg-md-sys-success-container text-md-sys-on-success-container'
                          : 'bg-md-sys-error-container text-md-sys-on-error-container'
                      }`}
                    >
                      {session.canMutate ? 'Allowed' : 'Read-only'}
                    </span>
                  </div>

                  <div className="px-5 py-4">
                    <p className="text-xs text-md-sys-on-surface-variant">
                      To change roles or enable auth, set{' '}
                      <code className="font-mono">AUTH_SECRET</code>,{' '}
                      <code className="font-mono">AUTH_USER</code>,{' '}
                      <code className="font-mono">AUTH_PASSWORD</code>, and{' '}
                      <code className="font-mono">AUTH_DEFAULT_ROLE</code> in your environment.{' '}
                      See the{' '}
                      <Link to="/docs" className="text-md-sys-primary hover:underline">
                        integration docs
                      </Link>{' '}
                      for details.
                    </p>
                  </div>
                </div>
              </section>

            </div>
          )}
        </div>

        {/* Save bar (saves MCP domain + disabled tools + feature flags) */}
        <footer className="chat-composer-dock shrink-0">
          <SecretsSaveBar
            saving={saving}
            loading={loading}
            saveMsg={saveMsg}
            readOnly={session.readonly}
            onSave={() => void save()}
            saveHint="MCP domain, per-tool overrides and feature visibility are saved to the database."
            saveButton="Save MCP & Features"
            savingLabel="Saving…"
          />
        </footer>
      </div>
    </ChatShell>
  );
}
