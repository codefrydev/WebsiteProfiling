'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/publicBase';
import { buildInitialSecretsState } from '@/lib/secretsConfigSchema';
import type { SecretsLoadResult, SecretsState } from '@/types/api';

export function useSecrets() {
  const [state, setState] = useState<SecretsState>(buildInitialSecretsState);
  const [envHints, setEnvHints] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(apiUrl('/secrets'));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SecretsLoadResult;
      setState(data.state);
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
      if (typeof value === 'string' && value && !value.startsWith('••••') && value !== '{configured}') {
        delete next[`${key}_masked`];
      }
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(apiUrl('/secrets'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const data = (await res.json().catch(() => ({}))) as SecretsLoadResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setState(data.state);
      setEnvHints(data.envHints || {});
      setSaveMsg('Secrets saved.');
      return true;
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [state]);

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
