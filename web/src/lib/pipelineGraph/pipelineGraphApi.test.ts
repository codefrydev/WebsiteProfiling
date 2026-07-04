import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPipelineGraph, runPipelinePreview, savePipelineGraph } from '@/lib/pipelineGraph/pipelineGraphApi';
import { buildInitialPipelineGraphDocument } from '@/lib/pipelineGraph/pipelineGraphSerialization';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, statusText: ok ? 'OK' : 'Bad Request', json: async () => body };
}

describe('loadPipelineGraph', () => {
  it('parses pipeline_graph_json and overlays flat crawl fields on top', async () => {
    const doc = buildInitialPipelineGraphDocument();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        state: {
          pipeline_graph_json: JSON.stringify(doc),
          main_content_selectors: '.custom-root',
          other_unrelated_field: 'keep-me',
        },
      }),
    );
    const { document, rawState } = await loadPipelineGraph();
    const landmarks = document.nodes.find((n) => n.kind === 'parse.detect_landmarks');
    expect(landmarks?.config.selector_priority).toBe('.custom-root');
    expect(rawState.other_unrelated_field).toBe('keep-me');
  });

  it('falls back to the default document when pipeline_graph_json is missing', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ state: {} }));
    const { document } = await loadPipelineGraph();
    expect(document.nodes).toHaveLength(8);
  });

  it('throws a readable error when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'settings unavailable' }, false));
    await expect(loadPipelineGraph()).rejects.toThrow('settings unavailable');
  });
});

describe('savePipelineGraph', () => {
  it('PUTs the merged state without dropping unrelated fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const doc = buildInitialPipelineGraphDocument();
    await savePipelineGraph(doc, { other_unrelated_field: 'keep-me' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/pipeline-settings');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body.state.other_unrelated_field).toBe('keep-me');
    expect(body.state.pipeline_graph_json).toBe(JSON.stringify(doc));
  });

  it('throws a readable error when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, false));
    await expect(savePipelineGraph(buildInitialPipelineGraphDocument(), {})).rejects.toThrow('save failed');
  });
});

describe('runPipelinePreview', () => {
  it('POSTs the request body and returns the parsed response', async () => {
    const response = { status: 'success', steps: [] };
    mockFetch.mockResolvedValueOnce(jsonResponse(response));
    const result = await runPipelinePreview({ url: 'https://example.com' });
    expect(result).toEqual(response);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/pipeline-preview');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com' });
  });

  it('throws a readable error when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'preview failed' }, false));
    await expect(runPipelinePreview({ url: 'https://x.test' })).rejects.toThrow('preview failed');
  });
});
