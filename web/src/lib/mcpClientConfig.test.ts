import { describe, expect, it } from 'vitest';
import {
  buildLocalStdioConfig,
  buildRemoteCursorConfig,
  generateMcpToken,
  hostFromPublicUrl,
  mcpEndpointUrl,
  normalizeMcpDomain,
  normalizePublicUrl,
  tokenForSnippet,
} from '@/lib/mcpClientConfig';

describe('mcpClientConfig', () => {
  it('normalizes public URL and endpoint', () => {
    expect(normalizePublicUrl('audit.example.com')).toBe('https://audit.example.com');
    expect(mcpEndpointUrl('https://audit.example.com')).toBe('https://audit.example.com/mcp');
    expect(hostFromPublicUrl('https://audit.example.com/path')).toBe('audit.example.com');
  });

  it('builds remote cursor json', () => {
    const json = buildRemoteCursorConfig({
      publicUrl: 'https://audit.example.com',
      token: 'secret',
      domain: 'core',
    });
    expect(json).toContain('"url": "https://audit.example.com/mcp"');
    expect(json).toContain('Bearer secret');
  });

  it('generates token prefix', () => {
    expect(generateMcpToken().startsWith('wp_mcp_')).toBe(true);
  });

  it('builds local stdio json for AiService', () => {
    const json = buildLocalStdioConfig({
      publicUrl: '',
      token: '',
      domain: 'core',
      propertyId: '2',
    });
    expect(json).toContain('"command": "dotnet"');
    expect(json).toContain('services/AiService/src/AiService.Api');
    expect(json).toContain('"FASTAPI_URL": "http://127.0.0.1:8096"');
    expect(json).toContain('"WP_PROPERTY_ID": "2"');
  });

  it('normalizes domain bundle', () => {
    expect(normalizeMcpDomain('full')).toBe('full');
    expect(normalizeMcpDomain('bogus')).toBe('core');
  });

  it('masks token in snippets', () => {
    expect(tokenForSnippet('••••abcd', true)).toBe('<save-or-generate-token-first>');
    expect(tokenForSnippet('plain-token', false)).toBe('plain-token');
  });
});
