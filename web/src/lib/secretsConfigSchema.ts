/**
 * Central registry for credentials managed on the /secrets page.
 * Values are stored in llm_config, pipeline_config, or google_app_settings.
 */
import type { SecretsState } from '@/types/api';

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
]);

export const SECRETS_SECTIONS: SecretsSection[] = [
  {
    id: 'ai',
    label: 'AI providers',
    fields: [
      {
        key: 'llm_api_key',
        label: 'LLM API key',
        type: 'secret',
        storage: 'llm',
        help: 'For the provider selected in Pipeline → Content & AI. Or set provider keys in the environment (see hints below).',
        envVars: ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'],
      },
    ],
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

export const ALL_SECRETS_KEYS = new Set(
  SECRETS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)),
);

export const SECRETS_MASK_SENTINEL = '__MASKED__';

export function isPipelineSecretKey(key: string): boolean {
  return PIPELINE_SECRET_KEYS.has(key);
}

export function isPipelineFieldVisibleOnPipeline(field: { key: string }): boolean {
  return !isPipelineSecretKey(field.key);
}

export function getSecretsFieldByKey(key: string): SecretsField | null {
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
  return out;
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
  const hints: Record<string, boolean> = {};
  for (const name of vars) {
    hints[name] = Boolean(process.env[name]?.trim());
  }
  return hints;
}
