import { describe, expect, it } from 'vitest';

import { buildPipelineJobErrorMessage } from '@/lib/pipelineJobErrorMessage';

describe('buildPipelineJobErrorMessage', () => {
  it('includes a failure hint from the log tail', () => {
    const log = '...\n[lighthouse] failed: Lighthouse failed with exit code 2\n';
    expect(buildPipelineJobErrorMessage(log, 1)).toContain('[lighthouse] failed');
    expect(buildPipelineJobErrorMessage(log, 1)).toContain('Process exited with code 1');
  });

  it('falls back to log tail when no hint line exists', () => {
    const log = 'line one\nline two\nfinal output';
    const message = buildPipelineJobErrorMessage(log, 3);
    expect(message).toContain('Process exited with code 3');
    expect(message).toContain('final output');
  });

  it('handles empty logs', () => {
    expect(buildPipelineJobErrorMessage('', null)).toBe('Process exited with code unknown (no output captured)');
  });
});
