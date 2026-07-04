import { describe, it, expect } from 'vitest';
import { DEFAULT_NODE_ORDER, NODE_TYPE_REGISTRY } from '@/components/pipelineGraph/nodeTypeRegistry';

describe('NODE_TYPE_REGISTRY', () => {
  it('has exactly one entry per DEFAULT_NODE_ORDER kind, keyed by its own kind', () => {
    const keys = Object.keys(NODE_TYPE_REGISTRY).sort();
    expect(keys).toEqual([...DEFAULT_NODE_ORDER].sort());
    for (const [key, def] of Object.entries(NODE_TYPE_REGISTRY)) {
      expect(def.kind).toBe(key);
    }
  });

  it('DEFAULT_NODE_ORDER has no duplicates', () => {
    expect(new Set(DEFAULT_NODE_ORDER).size).toBe(DEFAULT_NODE_ORDER.length);
  });

  it('has no duplicate config-field keys within a single node', () => {
    for (const def of Object.values(NODE_TYPE_REGISTRY)) {
      const keys = def.configFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every config field has a non-empty key/label/type', () => {
    for (const def of Object.values(NODE_TYPE_REGISTRY)) {
      for (const field of def.configFields) {
        expect(field.key.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
        expect(field.type.length).toBeGreaterThan(0);
      }
    }
  });

  it('every select-type field declares at least one option', () => {
    for (const def of Object.values(NODE_TYPE_REGISTRY)) {
      for (const field of def.configFields) {
        if (field.type === 'select') {
          expect(field.options?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only Extract Structured Data is optional', () => {
    const optionalKinds = Object.values(NODE_TYPE_REGISTRY)
      .filter((def) => def.optional)
      .map((def) => def.kind);
    expect(optionalKinds).toEqual(['extract.structured_data']);
  });

  it('every node has a label, category, description, and icon component', () => {
    for (const def of Object.values(NODE_TYPE_REGISTRY)) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.category.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.icon).toBeTruthy();
    }
  });
});
