import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PIPELINE_LOG_MAX, PIPELINE_LOG_TRIM } from '@/server/pipelineJobsDb';

const tryClaimMock = vi.fn();
const reconcileMock = vi.fn();
const appendLogMock = vi.fn();
const finishMock = vi.fn();
const getJobFromDbMock = vi.fn();
const getActiveMock = vi.fn();
const listRecentMock = vi.fn();
const markOrphanMock = vi.fn();

vi.mock('@/server/pipelineJobsDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/pipelineJobsDb')>();
  return {
    ...actual,
    tryClaimRunningPipelineJob: (...args: unknown[]) => tryClaimMock(...args),
    reconcileStaleRunningJobs: (...args: unknown[]) => reconcileMock(...args),
    appendPipelineJobLog: (...args: unknown[]) => appendLogMock(...args),
    finishPipelineJob: (...args: unknown[]) => finishMock(...args),
    getPipelineJobFromDb: (...args: unknown[]) => getJobFromDbMock(...args),
    getActiveRunningJob: (...args: unknown[]) => getActiveMock(...args),
    listRecentPipelineJobs: (...args: unknown[]) => listRecentMock(...args),
    markRunningJobOrphaned: (...args: unknown[]) => markOrphanMock(...args),
  };
});

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

function makeProc() {
  const handlers: Record<string, Array<(arg?: unknown) => void>> = {};
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    killed: false,
    kill: vi.fn(),
    on(event: string, fn: (arg?: unknown) => void) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(fn);
    },
    emit(event: string, arg?: unknown) {
      for (const fn of handlers[event] || []) fn(arg);
    },
  };
}

describe('pipelineJobs', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete globalThis.__websiteProfilingPipelineJobs;
    delete globalThis.__websiteProfilingPipelineProcesses;
    tryClaimMock.mockReset();
    reconcileMock.mockReset();
    appendLogMock.mockReset();
    finishMock.mockReset();
    getJobFromDbMock.mockReset();
    getActiveMock.mockReset();
    listRecentMock.mockReset();
    markOrphanMock.mockReset();
    spawnMock.mockReset();
    reconcileMock.mockResolvedValue(0);
    listRecentMock.mockResolvedValue([]);
    getActiveMock.mockResolvedValue(null);
    markOrphanMock.mockResolvedValue(false);
    finishMock.mockResolvedValue(undefined);
    appendLogMock.mockResolvedValue(false);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it('startPipelineJobAsync throws when in-memory job already running (no DB)', async () => {
    const { startPipelineJobAsync } = await import('@/server/pipelineJobs');
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const id = await startPipelineJobAsync('crawl', null, {});
    expect(id).toBeTruthy();

    await expect(startPipelineJobAsync('crawl', null, {})).rejects.toThrow(
      /already running/i,
    );
  });

  it('startPipelineJobAsync rejects when atomic claim fails', async () => {
    process.env.DATABASE_URL = 'postgres://local/test';
    tryClaimMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { startPipelineJobAsync } = await import('@/server/pipelineJobs');
    const first = await startPipelineJobAsync('crawl', null, {});
    expect(first).toBeTruthy();
    proc.emit('close', 0);
    await new Promise((r) => setTimeout(r, 0));

    await expect(startPipelineJobAsync('crawl', null, {})).rejects.toThrow(
      /already running/i,
    );
    expect(tryClaimMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('sets logTruncated when in-memory log exceeds cap', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { startPipelineJobAsync, getJobSync } = await import('@/server/pipelineJobs');
    const id = await startPipelineJobAsync('crawl', null, {});
    const dataCall = proc.stdout.on.mock.calls.find((call) => call[0] === 'data');
    const dataHandler = dataCall?.[1] as ((c: Buffer) => void) | undefined;
    expect(dataHandler).toBeDefined();
    dataHandler?.(Buffer.from('x'.repeat(PIPELINE_LOG_MAX + 1)));

    const updated = getJobSync(id);
    expect(updated?.log.length).toBeLessThanOrEqual(PIPELINE_LOG_TRIM);
    expect(updated?.logTruncated).toBe(true);
  });

  it('listPipelineJobsForApi reconciles orphan jobs without live process', async () => {
    process.env.DATABASE_URL = 'postgres://local/test';
    const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    reconcileMock.mockResolvedValue(0);
    getActiveMock
      .mockResolvedValueOnce({
        id: 'job-orphan',
        jobType: 'crawl',
        status: 'running',
        propertyId: null,
        startedAt,
        finishedAt: null,
        exitCode: null,
        error: null,
      })
      .mockResolvedValueOnce(null);
    markOrphanMock.mockResolvedValue(true);
    listRecentMock.mockResolvedValue([]);

    const { listPipelineJobsForApi } = await import('@/server/pipelineJobs');
    const result = await listPipelineJobsForApi(5);
    expect(markOrphanMock).toHaveBeenCalledWith('job-orphan');
    expect(result.reconciled).toBe(1);
    expect(result.active).toBeNull();
  });
});
