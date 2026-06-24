
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { RISK_SETTINGS_KEYS } from '@/lib/secretsConfigSchema';
import { useSecrets } from '@/hooks/useSecrets';

export interface RiskLlmState {
  llm_enabled: boolean;
  llm_write_enabled: boolean;
  llm_chat_allow_client_readonly: boolean;
}

export type LlmSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_LLM: RiskLlmState = {
  llm_enabled: true,
  llm_write_enabled: true,
  llm_chat_allow_client_readonly: true,
};

async function loadLlmRiskState(): Promise<RiskLlmState | null> {
  try {
    const res = await apiFetch(apiUrl('/llm-config'));
    if (!res.ok) return null;
    const data = (await res.json()) as { state?: Record<string, unknown> };
    const s = data.state ?? {};
    return {
      llm_enabled: s.llm_enabled !== false && s.llm_enabled !== 'false',
      llm_write_enabled: s.llm_write_enabled !== false && s.llm_write_enabled !== 'false',
      llm_chat_allow_client_readonly:
        s.llm_chat_allow_client_readonly !== false && s.llm_chat_allow_client_readonly !== 'false',
    };
  } catch {
    return null;
  }
}

async function saveLlmField(key: string, value: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(apiUrl('/llm-config'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { [key]: value } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Parses the JSON-encoded disabled-tools list stored in pipeline_config. */
function parseDisabledTools(raw: string | boolean | undefined): Set<string> {
  if (!raw || typeof raw !== 'string') return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    /* invalid JSON */
  }
  return new Set();
}

export function useRiskSettings() {
  const secrets = useSecrets();

  // ── LLM config ──────────────────────────────────────────────────────────
  const [llmState, setLlmState] = useState<RiskLlmState>(DEFAULT_LLM);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaveStatus, setLlmSaveStatus] = useState<LlmSaveStatus>('idle');
  const llmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadLlmRiskState().then((s) => {
      if (s) setLlmState(s);
      setLlmLoading(false);
    });
    return () => {
      if (llmTimerRef.current) clearTimeout(llmTimerRef.current);
    };
  }, []);

  const showLlmSave = (ok: boolean) => {
    setLlmSaveStatus(ok ? 'saved' : 'error');
    setTimeout(() => setLlmSaveStatus('idle'), 2500);
  };

  const setLlmField = useCallback((key: keyof RiskLlmState, value: boolean) => {
    setLlmState((prev) => ({ ...prev, [key]: value }));
    setLlmSaveStatus('saving');
    void saveLlmField(key, value).then(showLlmSave);
  }, []);

  // ── Disabled tools (pipeline_config: mcp_disabled_tools) ─────────────────
  const disabledTools = parseDisabledTools(secrets.state.mcp_disabled_tools);

  const setToolDisabled = useCallback(
    (name: string, disabled: boolean) => {
      const current = parseDisabledTools(secrets.state.mcp_disabled_tools);
      if (disabled) {
        current.add(name);
      } else {
        current.delete(name);
      }
      secrets.setField('mcp_disabled_tools', JSON.stringify(Array.from(current)));
    },
    [secrets],
  );

  // ── Feature visibility (pipeline_config: feature_*) ───────────────────────
  const featureEnabled = useCallback(
    (id: string): boolean => {
      const key = `feature_${id.replace(/-/g, '_').replace('pages_md', 'pages_md')}_enabled`;
      // Handle the special case keys
      const specialKeys: Record<string, string> = {
        mcp: 'feature_mcp_visible',
        secrets: 'feature_secrets_visible',
        'pages-md': 'feature_pages_md_enabled',
      };
      const resolvedKey = specialKeys[id] ?? key;
      const val = secrets.state[resolvedKey];
      return val !== 'false' && val !== false;
    },
    [secrets.state],
  );

  const setFeatureEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const specialKeys: Record<string, string> = {
        mcp: 'feature_mcp_visible',
        secrets: 'feature_secrets_visible',
        'pages-md': 'feature_pages_md_enabled',
        pipeline: 'feature_pipeline_enabled',
        write: 'feature_write_enabled',
        chat: 'feature_chat_enabled',
      };
      const key = specialKeys[id] ?? `feature_${id}_enabled`;
      secrets.setField(key, enabled ? 'true' : 'false');
    },
    [secrets],
  );

  const isRiskKey = (key: string) => RISK_SETTINGS_KEYS.has(key);

  return {
    // Secrets (pipeline_config) — MCP domain, disabled tools, feature flags
    state: secrets.state,
    loading: secrets.loading || llmLoading,
    saving: secrets.saving,
    saveMsg: secrets.saveMsg,
    loadError: secrets.loadError,
    setField: secrets.setField,
    save: secrets.save,
    // Disabled tools
    disabledTools,
    setToolDisabled,
    // Feature visibility
    featureEnabled,
    setFeatureEnabled,
    isRiskKey,
    // LLM config
    llmState,
    llmSaveStatus,
    setLlmField,
  };
}
