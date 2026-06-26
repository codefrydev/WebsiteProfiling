
import { useCallback, useEffect, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { buildInitialSecretsState, buildSecretsSavePayload, isSecretMaskedStored } from '@/lib/secretsConfigSchema';
import type { SecretsLoadResult, SecretsState } from '@/types/api';

export function useSecrets() {
  const [state, setState] = useState<SecretsState>(buildInitialSecretsState);
  const [baseline, setBaseline] = useState<SecretsState>(buildInitialSecretsState);
  const [envHints, setEnvHints] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch(apiUrl('/secrets'));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SecretsLoadResult;
      const merged = { ...buildInitialSecretsState(), ...data.state };
      setState(merged);
      setBaseline(merged);
      setEnvHints(data.envHints || {});
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = useCallback((key: string, value: string | boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      if (typeof value === 'string' && value && !isSecretMaskedStored(value)) {
        delete next[`${key}_masked`];
      }
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    const payload = buildSecretsSavePayload(state, baseline);
    if (!Object.keys(payload).length) {
      setSaveMsg('No changes to save.');
      return true;
    }

    setSaving(true);
    setSaveMsg('');
    try {
      const res = await apiFetch(apiUrl('/secrets'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: payload }),
      });
      const data = (await res.json().catch(() => ({}))) as SecretsLoadResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.state) {
        const merged = { ...buildInitialSecretsState(), ...data.state };
        setState(merged);
        setBaseline(merged);
        setEnvHints(data.envHints || {});
      } else {
        await load();
      }
      window.dispatchEvent(new CustomEvent('llm-settings-changed'));
      setSaveMsg('Secrets saved.');
      return true;
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [state, baseline, load]);

  return {
    state,
    envHints,
    loading,
    saving,
    saveMsg,
    loadError,
    setField,
    save,
    reload: load,
  };
}
