import { describe, expect, it } from 'vitest';
import { parsePythonJsonStdout } from '@/server/resolvePython';

describe('parsePythonJsonStdout', () => {
  it('parses a single JSON line', () => {
    expect(parsePythonJsonStdout('{"ok": true, "count": 3}\n')).toEqual({ ok: true, count: 3 });
  });

  it('parses the last JSON line when config logs precede output', () => {
    const stdout = [
      '[Config] Loaded from pipeline_config table (PostgreSQL)',
      '{"ok": true, "imported_at": "2026-06-05T21:21:03Z", "row_counts": {"top_linking_text": 104}}',
    ].join('\n');
    expect(parsePythonJsonStdout(stdout)).toEqual({
      ok: true,
      imported_at: '2026-06-05T21:21:03Z',
      row_counts: { top_linking_text: 104 },
    });
  });

  it('parses JSON suffix on the same line as log text', () => {
    const stdout =
      '[Config] Loaded from pipeline_config table (PostgreSQL) {"ok": true, "last_export_type": "top_linking_text"}';
    expect(parsePythonJsonStdout(stdout)).toEqual({
      ok: true,
      last_export_type: 'top_linking_text',
    });
  });

  it('returns null when stdout has no JSON object', () => {
    expect(parsePythonJsonStdout('[Config] Loaded from PostgreSQL')).toBeNull();
  });
});
