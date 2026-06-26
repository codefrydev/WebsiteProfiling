/**
 * Central registry for credentials managed on the /secrets page.
 * Values are stored in llm_config, pipeline_config, or google_app_settings.
 */
import type { SecretsState } from '@/types/api';
import {
  LLM_CLOUD_PROVIDERS,
  LLM_PROVIDER_ENV_VARS,
  LLM_PROVIDER_LABELS,
  llmProviderApiKeyField,
} from '@/lib/llmProviderApiKeys';

export type SecretsStorage = 'llm' | 'pipeline' | 'google';

export type SecretsFieldType = 'text' | 'secret' | 'textarea';

export interface SecretsField {
  key: string;
  label: string;
  type: SecretsFieldType;
  storage: SecretsStorage;
  help?: string;
  placeholder?: string;
  envVars?: string[];
}

export interface SecretsSection {
  id: string;
  label: string;
  fields: SecretsField[];
}

export type SecretsNavId = SecretsSection['id'];

export const PIPELINE_SECRET_KEYS = new Set([
  'bing_webmaster_api_key',
  'serp_api_key',
  'google_rich_results_api_key',
  'crawl_auth_password',
  'crawl_cookies',
  'mcp_token',
]);

/**
 * Keys managed on the dedicated /mcp page. They are hidden from the generic
 * Pipeline page and kept out of the CLI shadow file, but only `mcp_token` is a
 * true secret (in PIPELINE_SECRET_KEYS) — the rest must round-trip as plain text.
 */
export const MCP_MANAGED_KEYS = new Set([
  'mcp_token',
  'mcp_allowed_hosts',
  'mcp_allowed_origins',
  'mcp_public_url',
  'mcp_domain',
  'mcp_enabled_domains',
]);

export const SECRETS_SECTIONS: SecretsSection[] = [
  {
    id: 'ai',
    label: 'AI providers',
    fields: LLM_CLOUD_PROVIDERS.map((provider) => ({
      key: llmProviderApiKeyField(provider),
      label: `${LLM_PROVIDER_LABELS[provider]} API key`,
      type: 'secret' as const,
      storage: 'llm' as const,
      help: 'Saved per provider. Pipeline → Content & AI uses the key for the active provider automatically.',
      envVars: [LLM_PROVIDER_ENV_VARS[provider]],
    })),
  },
  {
    id: 'google',
    label: 'Google Cloud',
    fields: [
      {
        key: 'google_client_id',
        label: 'OAuth Client ID',
        type: 'text',
        storage: 'google',
        placeholder: 'xxxxxxxx.apps.googleusercontent.com',
        help: 'From Google Cloud Console → APIs & Services → Credentials.',
        envVars: ['GOOGLE_CLIENT_ID'],
      },
      {
        key: 'google_client_secret',
        label: 'OAuth Client Secret',
        type: 'secret',
        storage: 'google',
        placeholder: 'GOCSPX-...',
        envVars: ['GOOGLE_CLIENT_SECRET'],
      },
      {
        key: 'google_service_account_json',
        label: 'Service account JSON',
        type: 'textarea',
        storage: 'google',
        help: 'Paste the full JSON key file for service-account auth. Leave blank to keep the saved key.',
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Third-party APIs',
    fields: [
      {
        key: 'bing_webmaster_api_key',
        label: 'Bing Webmaster API key',
        type: 'secret',
        storage: 'pipeline',
        placeholder: 'Bing API key',
        help: 'Fetches Bing backlinks summary on audit build and via Integrations sync.',
      },
      {
        key: 'serp_api_key',
        label: 'SerpAPI key',
        type: 'secret',
        storage: 'pipeline',
        placeholder: 'SerpAPI key',
        help: 'Adds estimated SERP competition signals to top keywords during enrichment.',
      },
      {
        key: 'google_rich_results_api_key',
        label: 'Google Rich Results API key',
        type: 'secret',
        storage: 'pipeline',
        placeholder: 'AIza…',
        help: 'Optional API key for Rich Results Test API when GSC OAuth is unavailable.',
      },
    ],
  },
  {
    id: 'crawl',
    label: 'Crawl authentication',
    fields: [
      {
        key: 'crawl_auth_password',
        label: 'HTTP Basic auth password',
        type: 'secret',
        storage: 'pipeline',
        help: 'Used when crawling password-protected staging sites. Username is set on Pipeline → Crawl.',
      },
      {
        key: 'crawl_cookies',
        label: 'Cookie header value',
        type: 'secret',
        storage: 'pipeline',
        help: 'Sent as the Cookie header on crawl requests.',
      },
    ],
  },
];

/** Managed on /mcp — stored in pipeline_config like other secrets. */
export const MCP_SETTINGS_FIELDS: SecretsField[] = [
  {
    key: 'mcp_token',
    label: 'MCP bearer token',
    type: 'secret',
    storage: 'pipeline',
    placeholder: 'Long random token',
    help: 'Required for remote MCP clients. Sent as Authorization: Bearer … in Cursor or Claude Desktop.',
    envVars: ['WP_MCP_TOKEN'],
  },
  {
    key: 'mcp_allowed_hosts',
    label: 'Allowed hostnames',
    type: 'text',
    storage: 'pipeline',
    placeholder: 'audit.example.com,*.example.com',
    help: 'Comma-separated Host header values clients may use. Required when MCP binds beyond localhost.',
    envVars: ['WP_MCP_ALLOWED_HOSTS'],
  },
  {
    key: 'mcp_allowed_origins',
    label: 'Allowed origins (optional)',
    type: 'text',
    storage: 'pipeline',
    placeholder: 'https://audit.example.com',
    help: 'Comma-separated Origin values for browser MCP clients. Leave blank to skip Origin checks.',
    envVars: ['WP_MCP_ALLOWED_ORIGINS'],
  },
  {
    key: 'mcp_public_url',
    label: 'Public MCP base URL',
    type: 'text',
    storage: 'pipeline',
    placeholder: 'https://audit.example.com',
    help: 'Used to build copy-paste client configs. Include scheme, no trailing slash.',
  },
  {
    key: 'mcp_domain',
    label: 'Tool bundle',
    type: 'text',
    storage: 'pipeline',
    placeholder: 'core',
    help: 'WP_MCP_DOMAIN bundle: core (default), crawl, google, links, or full.',
  },
];

/** Keys managed on the /risk-settings page — stored in pipeline_config but hidden from /secrets UI. */
export const RISK_SETTINGS_KEYS = new Set([
  'mcp_disabled_tools',
  'mcp_enabled_domains',
  'feature_pipeline_enabled',
  'feature_write_enabled',
  'feature_pages_md_enabled',
  'feature_chat_enabled',
  'feature_mcp_visible',
  'feature_secrets_visible',
]);

export const ALL_SECRETS_KEYS = new Set([
  ...SECRETS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)),
  ...MCP_SETTINGS_FIELDS.map((f) => f.key),
  ...RISK_SETTINGS_KEYS,
]);

export const SECRETS_MASK_SENTINEL = '__MASKED__';

/** Masked DB / secrets values mean a key is stored server-side. */
export function isSecretMaskedStored(value: string | boolean | undefined): boolean {
  if (value === true) return true;
  const trimmed = String(value ?? '').trim();
  return (
    trimmed === '*'
    || trimmed === SECRETS_MASK_SENTINEL
    || trimmed.startsWith('••••')
    || trimmed === '{configured}'
  );
}

export function isPipelineSecretKey(key: string): boolean {
  return PIPELINE_SECRET_KEYS.has(key);
}

/** Keys hidden from the generic Pipeline page: secrets plus /mcp-managed config. */
export function isRiskSettingsKey(key: string): boolean {
  return RISK_SETTINGS_KEYS.has(key);
}

export function isPipelineHiddenKey(key: string): boolean {
  return isPipelineSecretKey(key) || MCP_MANAGED_KEYS.has(key) || isRiskSettingsKey(key);
}

export function isPipelineFieldVisibleOnPipeline(field: { key: string }): boolean {
  return !isPipelineHiddenKey(field.key);
}

export function getSecretsFieldByKey(key: string): SecretsField | null {
  const mcpField = MCP_SETTINGS_FIELDS.find((f) => f.key === key);
  if (mcpField) return mcpField;
  for (const section of SECRETS_SECTIONS) {
    const field = section.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return null;
}

export function isSecretsSecretKey(key: string): boolean {
  const field = getSecretsFieldByKey(key);
  return field?.type === 'secret' || field?.type === 'textarea';
}

/** Mask stored secret for GET responses. */
export function maskSecretForClient(value: string | boolean | undefined): string {
  if (!value || String(value).trim() === '') return '';
  const s = String(value);
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

export function buildInitialSecretsState(): SecretsState {
  const out: SecretsState = {};
  for (const section of SECRETS_SECTIONS) {
    for (const f of section.fields) {
      out[f.key] = '';
    }
  }
  for (const f of MCP_SETTINGS_FIELDS) {
    out[f.key] = f.key === 'mcp_domain' ? 'core' : '';
  }
  out['mcp_disabled_tools'] = '';
  out['mcp_enabled_domains'] = JSON.stringify(['core', 'insight']);
  for (const key of RISK_SETTINGS_KEYS) {
    if (key !== 'mcp_disabled_tools' && key !== 'mcp_enabled_domains') {
      out[key] = 'true';
    }
  }
  return out;
}

/** Omit blank/unchanged secrets so PUT never wipes stored keys. */
export function buildSecretsSavePayload(state: SecretsState, baseline?: SecretsState): SecretsState {
  const base = baseline ?? {};
  const payload: SecretsState = {};

  for (const [key, value] of Object.entries(state)) {
    if (
      key.endsWith('_masked')
      || key.endsWith('_saved_at')
      || key === 'google_has_service_account'
    ) {
      continue;
    }

    const field = getSecretsFieldByKey(key);
    if (field && (field.type === 'secret' || field.type === 'textarea')) {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) {
        continue;
      }
      const baseTrimmed = String(base[key] ?? '').trim();
      if (isSecretMaskedStored(value) && isSecretMaskedStored(base[key])) {
        continue;
      }
      if (!isSecretMaskedStored(value) && trimmed === baseTrimmed) {
        continue;
      }
      payload[key] = isSecretMaskedStored(value) ? '*' : value;
      continue;
    }

    if (value !== base[key]) {
      payload[key] = value;
    }
  }

  return payload;
}

export function formatSecretSavedAt(iso: string | boolean | undefined): string | null {
  if (!iso || typeof iso === 'boolean') return null;
  const parsed = Date.parse(String(iso));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString();
}

export function collectEnvHints(): Record<string, boolean> {
  const vars = new Set<string>();
  for (const section of SECRETS_SECTIONS) {
    for (const field of section.fields) {
      for (const envVar of field.envVars ?? []) {
        vars.add(envVar);
      }
    }
  }
  for (const field of MCP_SETTINGS_FIELDS) {
    for (const envVar of field.envVars ?? []) {
      vars.add(envVar);
    }
  }
  const hints: Record<string, boolean> = {};
  for (const name of vars) {
    hints[name] = Boolean(process.env[name]?.trim());
  }
  return hints;
}
