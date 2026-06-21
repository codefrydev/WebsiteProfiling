import { describe, expect, it } from 'vitest';
import {
  LIFECYCLE_LAYOUT,
  LIFECYCLE_NODE_COUNT,
  getLifecycleArcSegments,
  getLifecycleNodePositions,
  getLifecycleNodes,
  lifecycleArcEdge,
  lifecycleCoordPercent,
} from '@/components/landing/LandingLifecycleDiagram';

describe('LandingLifecycleDiagram helpers', () => {
  it('defines five clockwise lifecycle nodes with labels and aria text', () => {
    const nodes = getLifecycleNodes();
    expect(nodes).toHaveLength(LIFECYCLE_NODE_COUNT);
    expect(nodes.map((node) => node.id)).toEqual(['audit', 'report', 'mcp', 'fix', 'review']);
    for (const node of nodes) {
      expect(node.label.length).toBeGreaterThan(0);
      expect(node.hint.length).toBeGreaterThan(0);
      expect(node.ariaLabel).toContain(node.label);
    }
  });

  it('places nodes on a ring starting from the top with equal spacing', () => {
    const positions = getLifecycleNodePositions(280, 220, 140);
    expect(positions).toHaveLength(LIFECYCLE_NODE_COUNT);
    expect(positions[0]!.x).toBeCloseTo(280, 0);
    expect(positions[0]!.y).toBeCloseTo(80, 0);

    const dist0 = Math.hypot(positions[0]!.x - 280, positions[0]!.y - 220);
    const dist2 = Math.hypot(positions[2]!.x - 280, positions[2]!.y - 220);
    expect(dist0).toBeCloseTo(140, 0);
    expect(dist2).toBeCloseTo(140, 0);
  });

  it('maps canvas coordinates to percentage for overlay alignment', () => {
    expect(lifecycleCoordPercent(LIFECYCLE_LAYOUT.centerX, 'x')).toBe('50%');
    expect(lifecycleCoordPercent(LIFECYCLE_LAYOUT.centerY, 'y')).toMatch(/%$/);
  });

  it('builds equal circular arc segments between node gaps', () => {
    const positions = getLifecycleNodePositions(
      LIFECYCLE_LAYOUT.centerX,
      LIFECYCLE_LAYOUT.centerY,
      LIFECYCLE_LAYOUT.nodeRadius,
    );
    const arcs = getLifecycleArcSegments(
      positions,
      LIFECYCLE_LAYOUT.centerX,
      LIFECYCLE_LAYOUT.centerY,
      LIFECYCLE_LAYOUT.arcRadius,
    );
    expect(arcs).toHaveLength(LIFECYCLE_NODE_COUNT);
    for (const arc of arcs) {
      expect(arc).toMatch(/^M .+ A .+ 0 0 1 .+$/);
    }
  });

  it('builds a clockwise SVG arc path', () => {
    const path = lifecycleArcEdge(280, 220, 100, -Math.PI / 2, Math.PI / 5);
    expect(path).toMatch(/^M .+ A 100 100 0 0 1 .+$/);
  });
});
