import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_PRESETS,
  getDashboardPreset,
} from '@/lib/dashboard/presets/presets';
import { catalogEntry } from '@/lib/dashboard/catalog/catalog';

describe('dashboard presets', () => {
  it('defines at least four presets', () => {
    expect(DASHBOARD_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('builds valid dashboard docs with unique widget ids', () => {
    for (const preset of DASHBOARD_PRESETS) {
      const doc = preset.build();
      expect(doc.version).toBe(1);
      expect(doc.widgets.length).toBeGreaterThan(0);
      const ids = doc.widgets.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const w of doc.widgets) {
        expect(w.layout.y).not.toBe(Infinity);
        expect(w.binding.source).toBe('audit-tool');
        if (w.viz !== 'markdown') {
          expect(catalogEntry(w.binding.toolName)).toBeDefined();
        }
      }
    }
  });

  it('regenerates widget ids on each build', () => {
    const preset = getDashboardPreset('audit-overview');
    expect(preset).toBeDefined();
    const a = preset!.build();
    const b = preset!.build();
    expect(a.widgets[0].id).not.toBe(b.widgets[0].id);
  });

  it('getDashboardPreset returns undefined for unknown id', () => {
    expect(getDashboardPreset('missing')).toBeUndefined();
  });
});
