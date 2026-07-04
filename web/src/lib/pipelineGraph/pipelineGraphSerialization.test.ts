import { describe, it, expect } from 'vitest';
import { DEFAULT_NODE_ORDER } from '@/components/pipelineGraph/nodeTypeRegistry';
import {
  applyFlatCrawlFields,
  buildInitialPipelineGraphDocument,
  buildPipelinePreviewRequest,
  normalizePipelineGraphDocument,
  safeJsonParse,
  toFlatCrawlFieldsPatch,
} from '@/lib/pipelineGraph/pipelineGraphSerialization';
import type { PipelineGraphDocument } from '@/types/pipelineGraph';

describe('buildInitialPipelineGraphDocument', () => {
  it('lays out all 8 node kinds in a linear chain', () => {
    const doc = buildInitialPipelineGraphDocument();
    expect(doc.version).toBe(1);
    expect(doc.nodes.map((n) => n.kind)).toEqual(DEFAULT_NODE_ORDER);
    expect(doc.edges).toHaveLength(DEFAULT_NODE_ORDER.length - 1);
    expect(doc.edges[0]).toEqual({ id: 'trigger.on_page_load->fetch.get_html', source: 'trigger.on_page_load', target: 'fetch.get_html' });
    // x strictly increasing -- left-to-right layout
    const xs = doc.nodes.map((n) => n.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });
});

describe('normalizePipelineGraphDocument', () => {
  it('falls back to the default document for non-object input', () => {
    expect(normalizePipelineGraphDocument(null)).toEqual(buildInitialPipelineGraphDocument());
    expect(normalizePipelineGraphDocument('nope')).toEqual(buildInitialPipelineGraphDocument());
  });

  it('falls back to the default document when nodes are missing or empty', () => {
    expect(normalizePipelineGraphDocument({})).toEqual(buildInitialPipelineGraphDocument());
    expect(normalizePipelineGraphDocument({ nodes: [] })).toEqual(buildInitialPipelineGraphDocument());
  });

  it('drops nodes with an unknown kind but keeps valid ones', () => {
    const raw = {
      nodes: [
        { kind: 'not.a.real.kind', position: { x: 0, y: 0 }, config: {} },
        { kind: 'fetch.get_html', position: { x: 10, y: 20 }, config: {} },
      ],
    };
    const doc = normalizePipelineGraphDocument(raw);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].kind).toBe('fetch.get_html');
    expect(doc.nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it('defaults a missing id to the node kind', () => {
    const doc = normalizePipelineGraphDocument({ nodes: [{ kind: 'fetch.get_html' }] });
    expect(doc.nodes[0].id).toBe('fetch.get_html');
  });

  it('preserves enabled:false but drops a redundant enabled:true', () => {
    const doc = normalizePipelineGraphDocument({
      nodes: [
        { kind: 'extract.structured_data', enabled: false },
        { kind: 'fetch.get_html', enabled: true },
      ],
    });
    expect(doc.nodes[0].enabled).toBe(false);
    expect(doc.nodes[1].enabled).toBeUndefined();
  });

  it('drops edges referencing an unknown node id', () => {
    const doc = normalizePipelineGraphDocument({
      nodes: [{ kind: 'fetch.get_html' }, { kind: 'trigger.on_page_load' }],
      edges: [
        { source: 'trigger.on_page_load', target: 'fetch.get_html' },
        { source: 'fetch.get_html', target: 'ghost' },
      ],
    });
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].target).toBe('fetch.get_html');
  });

  it('ignores a non-object config and falls back to {}', () => {
    const doc = normalizePipelineGraphDocument({ nodes: [{ kind: 'fetch.get_html', config: 'nope' }] });
    expect(doc.nodes[0].config).toEqual({});
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('{not json')).toBeNull();
  });
});

describe('applyFlatCrawlFields', () => {
  it('overlays main_content_selectors, boilerplate_selectors, and custom_extractors onto their nodes', () => {
    const doc = buildInitialPipelineGraphDocument();
    const next = applyFlatCrawlFields(doc, {
      main_content_selectors: '.custom-root',
      boilerplate_selectors: '.custom-noise',
      custom_extractors: '[{"name":"price"}]',
    });
    const byKind = new Map(next.nodes.map((n) => [n.kind, n]));
    expect(byKind.get('parse.detect_landmarks')?.config.selector_priority).toBe('.custom-root');
    expect(byKind.get('filter.strip_boilerplate')?.config.boilerplate_selectors).toBe('.custom-noise');
    expect(byKind.get('extract.structured_data')?.config.custom_extractors_json).toBe('[{"name":"price"}]');
  });

  it('leaves node config untouched when flat fields are missing or empty', () => {
    const doc = buildInitialPipelineGraphDocument();
    const next = applyFlatCrawlFields(doc, { main_content_selectors: '', other: 123 });
    expect(next).toEqual(doc);
  });
});

describe('toFlatCrawlFieldsPatch', () => {
  it('is the inverse of applyFlatCrawlFields for the 3 tracked fields, and always sets pipeline_graph_json', () => {
    const doc = applyFlatCrawlFields(buildInitialPipelineGraphDocument(), {
      main_content_selectors: '.custom-root',
      boilerplate_selectors: '.custom-noise',
      custom_extractors: '[]',
    });
    const patch = toFlatCrawlFieldsPatch(doc);
    expect(patch.main_content_selectors).toBe('.custom-root');
    expect(patch.boilerplate_selectors).toBe('.custom-noise');
    expect(patch.custom_extractors).toBe('[]');
    expect(JSON.parse(patch.pipeline_graph_json)).toEqual(doc);
  });
});

describe('buildPipelinePreviewRequest', () => {
  const doc: PipelineGraphDocument = applyFlatCrawlFields(buildInitialPipelineGraphDocument(), {
    main_content_selectors: '.root',
    boilerplate_selectors: '.noise',
  });

  it('includes the fetch target plus selectors from the graph', () => {
    const req = buildPipelinePreviewRequest(doc, { url: 'https://example.com' });
    expect(req.url).toBe('https://example.com');
    expect(req.mainContentSelectors).toBe('.root');
    expect(req.boilerplateSelectors).toBe('.noise');
    expect(req.customExtractors).toBeUndefined();
  });

  it('includes html instead of url when given html', () => {
    const req = buildPipelinePreviewRequest(doc, { html: '<html></html>' });
    expect(req.html).toBe('<html></html>');
    expect(req.url).toBeUndefined();
  });

  it('includes customExtractors when the node is enabled with valid JSON', () => {
    const withExtractors = applyFlatCrawlFields(doc, { custom_extractors: '[{"name":"price","type":"css"}]' });
    const req = buildPipelinePreviewRequest(withExtractors, { url: 'https://example.com' });
    expect(req.customExtractors).toEqual([{ name: 'price', type: 'css' }]);
  });

  it('omits customExtractors when the structured-data node is disabled', () => {
    const withExtractors = applyFlatCrawlFields(doc, { custom_extractors: '[{"name":"price"}]' });
    const disabled: PipelineGraphDocument = {
      ...withExtractors,
      nodes: withExtractors.nodes.map((n) =>
        n.kind === 'extract.structured_data' ? { ...n, enabled: false } : n,
      ),
    };
    const req = buildPipelinePreviewRequest(disabled, { url: 'https://example.com' });
    expect(req.customExtractors).toBeUndefined();
  });

  it('omits customExtractors when the JSON is malformed', () => {
    const malformed = applyFlatCrawlFields(doc, { custom_extractors: 'not json' });
    const req = buildPipelinePreviewRequest(malformed, { url: 'https://example.com' });
    expect(req.customExtractors).toBeUndefined();
  });

  it('maps a known fallback_strategy config value to contentAnalysisStrategy', () => {
    const withStrategy: PipelineGraphDocument = {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.kind === 'parse.detect_landmarks' ? { ...n, config: { ...n.config, fallback_strategy: 'full_body' } } : n,
      ),
    };
    const req = buildPipelinePreviewRequest(withStrategy, { url: 'https://example.com' });
    expect(req.contentAnalysisStrategy).toBe('full_body');
  });

  it('omits contentAnalysisStrategy when no fallback_strategy has been set', () => {
    const req = buildPipelinePreviewRequest(doc, { url: 'https://example.com' });
    expect(req.contentAnalysisStrategy).toBeUndefined();
  });
});
