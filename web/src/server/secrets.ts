/**
 * Aggregate secrets from llm_config, pipeline_config, and google_app_settings.
 */
import {
  ALL_SECRETS_KEYS,
  SECRETS_MASK_SENTINEL,
  SECRETS_SECTIONS,
  buildInitialSecretsState,
  collectEnvHints,
  getSecretsFieldByKey,
  isSecretsSecretKey,
  maskSecretForClient,
} from '@/lib/secretsConfigSchema';
import { loadGoogleAppSettings, saveGoogleAppSettings } from '@/server/googleAppSettings';
import { loadLlmConfig, saveLlmConfig } from '@/server/llmConfig';
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

export async function loadSecrets(): Promise<SecretsLoadResult> {
  const [llm, pipeline, google] = await Promise.all([
    loadLlmConfig(),
    loadPipelineConfig(),
    loadGoogleAppSettings(),
  ]);

  const state = buildInitialSecretsState();

  state.llm_api_key = String(llm.state.llm_api_key || '');
  if (llm.state.llm_api_key_masked) {
    state.llm_api_key_masked = true;
  }

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
  const [llmLoaded, pipelineLoaded, googleLoaded] = await Promise.all([
    loadLlmConfig(),
    loadPipelineConfig(),
    loadGoogleAppSettings(),
  ]);

  const llmState = { ...llmLoaded.state };
  if (rawState.llm_api_key !== undefined) {
    llmState.llm_api_key = String(rawState.llm_api_key ?? '');
    if (rawState.llm_api_key_masked === true) {
      llmState.llm_api_key_masked = true;
    } else {
      delete llmState.llm_api_key_masked;
    }
  }

  const pipelineState = { ...pipelineLoaded.state };
  for (const section of SECRETS_SECTIONS) {
    for (const field of section.fields) {
      if (field.storage !== 'pipeline') continue;
      if (rawState[field.key] === undefined) continue;
      pipelineState[field.key] = String(rawState[field.key] ?? '');
      if (rawState[`${field.key}_masked`] === true) {
        pipelineState[`${field.key}_masked`] = true;
      } else {
        delete pipelineState[`${field.key}_masked`];
      }
    }
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
