import { describe, it, expect } from 'vitest';
import { withNodeConfigValue, withNodeEnabled, withNodeMoved } from '@/lib/pipelineGraph/pipelineGraphEdits';
import type { PipelineGraphDocument } from '@/types/pipelineGraph';

const base: PipelineGraphDocument = {
  version: 1,
  nodes: [
    { id: 'a', kind: 'trigger.on_page_load', position: { x: 0, y: 0 }, config: {} },
    { id: 'b', kind: 'fetch.get_html', position: { x: 100, y: 0 }, config: { foo: 'bar' } },
  ],
  edges: [{ id: 'a->b', source: 'a', target: 'b' }],
};

describe('withNodeMoved', () => {
  it('updates only the target node position, immutably', () => {
    const next = withNodeMoved(base, 'b', { x: 50, y: 60 });
    expect(next.nodes[1].position).toEqual({ x: 50, y: 60 });
    expect(next.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(base.nodes[1].position).toEqual({ x: 100, y: 0 });
  });

  it('is a no-op for an unknown node id', () => {
    const next = withNodeMoved(base, 'missing', { x: 1, y: 1 });
    expect(next.nodes).toEqual(base.nodes);
  });
});

describe('withNodeEnabled', () => {
  it('sets the enabled flag on the target node only', () => {
    const next = withNodeEnabled(base, 'b', false);
    expect(next.nodes[1].enabled).toBe(false);
    expect(next.nodes[0].enabled).toBeUndefined();
    expect(base.nodes[1].enabled).toBeUndefined();
  });
});

describe('withNodeConfigValue', () => {
  it('merges into existing config without dropping other keys, immutably', () => {
    const next = withNodeConfigValue(base, 'b', 'baz', true);
    expect(next.nodes[1].config).toEqual({ foo: 'bar', baz: true });
    expect(base.nodes[1].config).toEqual({ foo: 'bar' });
  });

  it('overwrites an existing key', () => {
    const next = withNodeConfigValue(base, 'b', 'foo', 'qux');
    expect(next.nodes[1].config.foo).toBe('qux');
  });
});
