
import { useCallback, useMemo } from 'react';
import { MCP_SETTINGS_FIELDS } from '@/lib/secretsConfigSchema';
import { generateMcpToken } from '@/lib/mcpClientConfig';
import { useSecrets } from '@/hooks/useSecrets';

const MCP_KEYS = MCP_SETTINGS_FIELDS.map((field) => field.key);

export function useMcpSettings() {
  const secrets = useSecrets();

  const mcpState = useMemo(() => {
    const out: Record<string, string | boolean> = {};
    for (const key of MCP_KEYS) {
      if (secrets.state[key] !== undefined) {
        out[key] = secrets.state[key];
      }
    }
    return out;
  }, [secrets.state]);

  const setField = useCallback(
    (key: string, value: string | boolean) => {
      secrets.setField(key, value);
    },
    [secrets.setField],
  );

  const generateToken = useCallback(() => {
    setField('mcp_token', generateMcpToken());
  }, [setField]);

  const suggestHostsFromUrl = useCallback(() => {
    const raw = String(secrets.state.mcp_public_url || '').trim();
    if (!raw) return;
    try {
      const url = raw.startsWith('http') ? raw : `https://${raw}`;
      const host = new URL(url).hostname;
      if (host && !String(secrets.state.mcp_allowed_hosts || '').includes(host)) {
        const existing = String(secrets.state.mcp_allowed_hosts || '').trim();
        setField('mcp_allowed_hosts', existing ? `${existing},${host}` : host);
      }
    } catch {
      /* invalid url */
    }
  }, [secrets.state.mcp_allowed_hosts, secrets.state.mcp_public_url, setField]);

  return {
    ...secrets,
    mcpState,
    setField,
    generateToken,
    suggestHostsFromUrl,
    tokenMasked: secrets.state.mcp_token_masked === true,
  };
}
