export type McpDomainBundle = 'core' | 'crawl' | 'google' | 'links' | 'full';

export interface McpClientConfigInput {
  publicUrl: string;
  token: string;
  domain: McpDomainBundle;
  propertyId?: string;
  databaseUrl?: string;
}

const MCP_DOMAIN_BUNDLES: McpDomainBundle[] = ['core', 'crawl', 'google', 'links', 'full'];

export function isMcpDomainBundle(value: string): value is McpDomainBundle {
  return MCP_DOMAIN_BUNDLES.includes(value as McpDomainBundle);
}

export function normalizeMcpDomain(value: string | undefined): McpDomainBundle {
  const trimmed = String(value || 'core').trim().toLowerCase();
  return isMcpDomainBundle(trimmed) ? trimmed : 'core';
}

export function normalizePublicUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function mcpEndpointUrl(publicUrl: string): string {
  const base = normalizePublicUrl(publicUrl);
  if (!base) return 'https://your-host.example/mcp';
  return `${base}/mcp`;
}

export function hostFromPublicUrl(publicUrl: string): string {
  const base = normalizePublicUrl(publicUrl);
  if (!base) return '';
  try {
    return new URL(base).hostname;
  } catch {
    return '';
  }
}

export function generateMcpToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const a = crypto.randomUUID().replace(/-/g, '');
    const b = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    return `wp_mcp_${a}${b}`;
  }
  return `wp_mcp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function buildRemoteCursorConfig(input: McpClientConfigInput): string {
  const url = mcpEndpointUrl(input.publicUrl);
  const token = input.token.trim() || '<WP_MCP_TOKEN>';
  const payload = {
    mcpServers: {
      'site-audit-remote': {
        url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function buildLocalStdioConfig(input: McpClientConfigInput): string {
  const domain = normalizeMcpDomain(input.domain);
  const propertyId = input.propertyId?.trim() || '1';
  const databaseUrl = input.databaseUrl?.trim() || 'postgres://USER:PASS@localhost:5432/website_profiling';
  const payload = {
    mcpServers: {
      'site-audit-local': {
        command: 'dotnet',
        args: ['run', '--project', 'services/AiService/src/AiService.Api', '--no-launch-profile'],
        env: {
          DATABASE_URL: databaseUrl,
          FASTAPI_URL: 'http://127.0.0.1:8001',
          WP_MCP_DOMAIN: domain,
          WP_PROPERTY_ID: propertyId,
        },
      },
    },
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function buildDockerStartCommand(): string {
  return 'docker compose -f docker-compose.prod.yml --profile mcp up -d mcp';
}

export function buildHttpStartCommand(): string {
  return [
    'cd services/AiService',
    'export DATABASE_URL=postgres://USER:PASS@localhost:5432/website_profiling',
    'export FASTAPI_URL=http://127.0.0.1:8001',
    'export ASPNETCORE_URLS=http://0.0.0.0:8092',
    'export WP_MCP_HTTP=1',
    'dotnet run --project src/AiService.Api',
  ].join('\n');
}

export function tokenForSnippet(rawToken: string, masked: boolean): string {
  if (masked || !rawToken.trim() || rawToken.startsWith('••••')) {
    return '<save-or-generate-token-first>';
  }
  return rawToken.trim();
}
