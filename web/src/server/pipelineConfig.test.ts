import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseInputTxt } from '@/server/pipelineConfig';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { validatePipelineRun } from '@/lib/pipelineConfigSchema';

describe('parseInputTxt', () => {
  it('parses key = value lines and ignores comments', () => {
    const raw = `
# comment
start_url = https://example.com
max_pages = 10
`;
    expect(parseInputTxt(raw)).toEqual({
      start_url: 'https://example.com',
      max_pages: '10',
    });
  });
});

describe('forbiddenIfNotLocal', () => {
  function req(host: string) {
    return new NextRequest(`http://${host}/api/run`, { headers: { host } });
  }

  it('allows localhost and loopback', () => {
    expect(forbiddenIfNotLocal(req('localhost:3000'))).toBeNull();
    expect(forbiddenIfNotLocal(req('127.0.0.1:3000'))).toBeNull();
    expect(forbiddenIfNotLocal(req('[::1]:3000'))).toBeNull();
  });

  it('rejects non-local hosts', () => {
    const denied = forbiddenIfNotLocal(req('192.168.1.5:3000'));
    expect(denied?.status).toBe(403);
  });
});

describe('validatePipelineRun', () => {
  it('requires start_url for crawl', () => {
    const errors = validatePipelineRun({ state: { start_url: '' }, command: 'crawl' });
    expect(errors.some((e) => e.includes('Start URL'))).toBe(true);
  });
});
