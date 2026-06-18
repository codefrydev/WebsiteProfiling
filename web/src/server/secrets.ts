/**
 * Aggregate secrets from llm_config, pipeline_config, and google_app_settings.
 */
import {
  ALL_SECRETS_KEYS,
  MCP_SETTINGS_FIELDS,
  SECRETS_MASK_SENTINEL,
  SECRETS_SECTIONS,
  buildInitialSecretsState,
  collectEnvHints,
  getSecretsFieldByKey,
  isSecretsSecretKey,
  maskSecretForClient,
} from '@/lib/secretsConfigSchema';
import {
  ALL_LLM_PROVIDER_API_KEY_KEYS,
  isLlmCloudProvider,
  llmProviderApiKeyField,
} from '@/lib/llmProviderApiKeys';
import { loadGoogleAppSettings, saveGoogleAppSettings } from '@/server/googleAppSettings';
import { readLlmConfigRaw, saveLlmConfig } from '@/server/llmConfig';
import { loadPipelineConfig, savePipelineConfig } from '@/server/pipelineConfig';
import type { GoogleServiceAccount, SecretsLoadResult, SecretsState } from '@/types/api';

function isMaskedValue(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    trimmed === '' ||
    trimmed === SECRETS_MASK_SENTINEL ||
    trimmed.startsWith('••••') ||
    trimmed === '{configured}'
  );
}

function isServiceAccount(value: unknown): value is GoogleServiceAccount {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as GoogleServiceAccount).type === 'service_account' &&
    typeof (value as GoogleServiceAccount).client_email === 'string' &&
    typeof (value as GoogleServiceAccount).private_key === 'string'
  );
}

function loadLlmProviderSecrets(rawLlm: Record<string, string>, state: SecretsState): void {
  for (const key of ALL_LLM_PROVIDER_API_KEY_KEYS) {
    const raw = String(rawLlm[key] || '').trim();
    if (!raw) continue;
    state[key] = maskSecretForClient(raw);
    state[`${key}_masked`] = true;
  }

  const legacy = String(rawLlm.llm_api_key || '').trim();
  if (!legacy) return;

  const provider = String(rawLlm.llm_provider || '').trim().toLowerCase();
  if (!isLlmCloudProvider(provider)) return;

  const field = llmProviderApiKeyField(provider);
  if (state[field] && String(state[field]).trim() !== '') return;

  state[field] = maskSecretForClient(legacy);
  state[`${field}_masked`] = true;
}

export async function loadSecrets(): Promise<SecretsLoadResult> {
  const [rawLlm, pipeline, google] = await Promise.all([
    readLlmConfigRaw(),
    loadPipelineConfig(),
    loadGoogleAppSettings(),
  ]);

  const state = buildInitialSecretsState();
  loadLlmProviderSecrets(rawLlm, state);

  for (const key of ALL_SECRETS_KEYS) {
    const field = getSecretsFieldByKey(key);
    if (!field || field.storage !== 'pipeline') continue;
    const raw = pipeline.state[key];
    if (raw == null || String(raw).trim() === '') continue;
    if (field.type === 'secret') {
      state[key] = maskSecretForClient(raw);
      state[`${key}_masked`] = true;
    } else {
      state[key] = String(raw);
    }
  }

  if (google.clientId) {
    state.google_client_id = google.clientId;
  }
  if (google.clientSecret) {
    state.google_client_secret = maskSecretForClient(google.clientSecret);
    state.google_client_secret_masked = true;
  }
  if (google.serviceAccount) {
    state.google_service_account_json = '{configured}';
    state.google_service_account_json_masked = true;
    state.google_has_service_account = true;
  }

  return { state, envHints: collectEnvHints() };
}

export async function saveSecrets(rawState: SecretsState): Promise<void> {
  const [pipelineLoaded, googleLoaded] = await Promise.all([
    loadPipelineConfig(),
    loadGoogleAppSettings(),
  ]);

  const llmState: SecretsState = {};
  for (const key of ALL_LLM_PROVIDER_API_KEY_KEYS) {
    if (rawState[key] === undefined) continue;
    llmState[key] = String(rawState[key] ?? '');
    if (rawState[`${key}_masked`] === true) {
      llmState[`${key}_masked`] = true;
    }
  }

  const pipelineState = { ...pipelineLoaded.state };
  const copyPipelineField = (key: string): void => {
    if (rawState[key] === undefined) return;
    pipelineState[key] = String(rawState[key] ?? '');
    if (rawState[`${key}_masked`] === true) {
      pipelineState[`${key}_masked`] = true;
    } else {
      delete pipelineState[`${key}_masked`];
    }
  };
  for (const section of SECRETS_SECTIONS) {
    for (const field of section.fields) {
      if (field.storage !== 'pipeline') continue;
      copyPipelineField(field.key);
    }
  }
  // MCP fields live in a separate array (managed on /mcp), not in SECRETS_SECTIONS;
  // copy them too or they are silently dropped on save.
  for (const field of MCP_SETTINGS_FIELDS) {
    if (field.storage !== 'pipeline') continue;
    copyPipelineField(field.key);
  }

  const googlePatch: Parameters<typeof saveGoogleAppSettings>[0] = {};
  if (rawState.google_client_id !== undefined) {
    googlePatch.clientId = String(rawState.google_client_id ?? '').trim();
  }
  if (rawState.google_client_secret !== undefined) {
    const raw = String(rawState.google_client_secret ?? '').trim();
    if (!isMaskedValue(raw)) {
      googlePatch.clientSecret = raw;
    }
  }
  if (rawState.google_service_account_json !== undefined) {
    const raw = String(rawState.google_service_account_json ?? '').trim();
    if (raw && !isMaskedValue(raw)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Service account JSON is not valid JSON.");
      }
      if (!isServiceAccount(parsed)) {
        throw new Error(
          "Service account JSON must be a Google service account key (type: service_account).",
        );
      }
      googlePatch.serviceAccount = parsed;
    }
  }

  await saveLlmConfig(llmState);
  await savePipelineConfig(pipelineState, { unknownKeys: pipelineLoaded.unknownKeys });
  if (Object.keys(googlePatch).length > 0) {
    await saveGoogleAppSettings(googlePatch, { preserveSecret: true });
  } else if (googleLoaded.clientSecret && rawState.google_client_secret_masked) {
    // no-op: masked secret preserved by saveGoogleAppSettings when not in patch
  }
}

export function maskSecretsStateForClient(state: SecretsState): SecretsState {
  const out: SecretsState = { ...state };
  for (const key of Object.keys(out)) {
    if (key.endsWith('_masked') || key === 'google_has_service_account') continue;
    if (!ALL_SECRETS_KEYS.has(key)) continue;
    const field = getSecretsFieldByKey(key);
    if (!field) continue;
    if (field.type === 'secret') {
      const masked = maskSecretForClient(out[key]);
      if (masked) {
        out[key] = masked;
        out[`${key}_masked`] = true;
      }
    }
    if (field.key === 'google_service_account_json' && out.google_has_service_account) {
      out.google_service_account_json = '{configured}';
      out.google_service_account_json_masked = true;
    }
  }
  return out;
}
