import { describe, expect, it, vi } from 'vitest';

import { logPipelineFailure } from '@/lib/pipelineDebug';

describe('logPipelineFailure', () => {
  it('logs a readable string instead of an empty object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logPipelineFailure('Job finished with error', {
      jobId: 'abc',
      error: 'Process exited with code 1',
      logLength: 42,
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[Site Audit run] Job finished with error'),
    );
    expect(spy.mock.calls[0]?.[0]).toContain('jobId=abc');
    expect(spy.mock.calls[0]?.[0]).toContain('error=Process exited with code 1');
    spy.mockRestore();
  });
});
