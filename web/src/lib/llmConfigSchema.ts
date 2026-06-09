/**
 * AI insights settings — stored only in PostgreSQL (llm_config table).
 * Not part of audit settings files or CLI --config.
 */
import type { LlmConfigState } from '@/types/api';

export const LLM_CONFIG_SECTIONS = [
  {
    id: 'llm_provider',
    label: 'Provider',
    fields: [
      {
        key: 'llm_enabled',
        label: 'Enable AI insights',
        type: 'bool',
        defaultValue: false,
        help: 'Uses the provider below during report generation. Configure API keys here or via environment variables.',
      },
      {
        key: 'llm_provider',
        label: 'Provider',
        type: 'singleselect',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'anthropic', label: 'Anthropic Claude' },
          { value: 'ollama', label: 'Ollama (local)' },
        ],
      },
      {
        key: 'llm_model',
        label: 'Model',
        type: 'text',
        defaultValue: '',
        placeholder: 'e.g. gpt-4o-mini, gemini-2.0-flash, claude-3-5-haiku-latest, llama3.2',
        help: 'Leave blank to use provider default.',
      },
      {
        key: 'llm_base_url',
        label: 'Base URL (Ollama / custom)',
        type: 'text',
        defaultValue: 'http://127.0.0.1:11434',
        help: 'Ollama API root. Ignored for cloud providers unless using an OpenAI-compatible proxy.',
      },
      {
        key: 'llm_api_key',
        label: 'API key',
        type: 'secret',
        defaultValue: '',
        help: 'Optional when OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY is set in the environment. Stored only in the database, not in saved audit settings files.',
      },
    ],
  },
  {
    id: 'llm_tasks',
    label: 'Tasks',
    fields: [
      { key: 'llm_enable_ner', label: 'Named entities', type: 'bool', defaultValue: true },
      { key: 'llm_enable_keyphrases', label: 'Keyphrases', type: 'bool', defaultValue: true },
      { key: 'llm_enable_similar_internal', label: 'Similar internal pages', type: 'bool', defaultValue: true },
      { key: 'llm_enable_keyword_clusters', label: 'Topic clusters (AI)', type: 'bool', defaultValue: true },
      {
        key: 'llm_enable_issue_fixes',
        label: 'AI fix suggestions',
        type: 'bool',
        defaultValue: true,
        help: 'On-demand AI fix buttons across Issues, Lighthouse, Security, and other audit surfaces; also enriches top issues at report build.',
      },
      {
        key: 'llm_enable_audit_summary',
        label: 'Executive audit summary (AI)',
        type: 'bool',
        defaultValue: true,
        help: 'LLM narrative for Overview executive summary when AI insights are enabled.',
      },
      {
        key: 'llm_enable_page_coach',
        label: 'Link Explorer page coach',
        type: 'bool',
        defaultValue: true,
        help: 'On-demand retention and SEO suggestions when inspecting a URL in Link Explorer.',
      },
    ],
  },
  {
    id: 'llm_limits',
    label: 'Limits',
    fields: [
      { key: 'llm_max_pages', label: 'Max pages (AI tasks)', type: 'number', defaultValue: '60' },
      { key: 'llm_batch_size', label: 'Pages per API batch', type: 'number', defaultValue: '5' },
      { key: 'llm_concurrency', label: 'Parallel AI batches', type: 'number', defaultValue: '2' },
      { key: 'llm_timeout_s', label: 'Request timeout (s)', type: 'number', defaultValue: '120' },
      { key: 'llm_similar_top_k', label: 'Similar pages top K', type: 'number', defaultValue: '5' },
    ],
  },
];

export const ALL_LLM_SCHEMA_KEYS = new Set(
  LLM_CONFIG_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)),
);

const SECRET_KEYS = new Set(['llm_api_key']);

export function isLlmSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export function getLlmFieldByKey(key: string): (typeof LLM_CONFIG_SECTIONS)[number]['fields'][number] | null {
  for (const section of LLM_CONFIG_SECTIONS) {
    const f = section.fields.find((x) => x.key === key);
    if (f) return f;
  }
  return null;
}

/** Show/hide LLM fields based on current provider selection. */
export function isLlmFieldVisible(
  key: string,
  values: Record<string, string | boolean | undefined>,
): boolean {
  const provider = String(values.llm_provider || 'none');
  if (key === 'llm_api_key') {
    return provider !== 'none' && provider !== 'ollama';
  }
  if (key === 'llm_base_url') {
    return provider === 'ollama';
  }
  if (key === 'llm_model') {
    return provider !== 'ollama';
  }
  return true;
}

export function buildInitialLlmConfigState(): LlmConfigState {
  const out: LlmConfigState = {};
  for (const section of LLM_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'bool') {
        out[f.key] = f.defaultValue as boolean;
      } else {
        out[f.key] = String(f.defaultValue ?? '');
      }
    }
  }
  return out;
}

/** Mask stored API key for GET responses. */
export function maskLlmSecretForClient(key: string, value: string | boolean | undefined): string {
  if (!isLlmSecretKey(key) || !value || String(value).trim() === '') {
    return '';
  }
  const s = String(value);
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}
