import { describe, expect, it } from 'vitest';
import { DASHBOARD_PRESETS, getPreset } from '@/lib/dashboard/presets/presets';
import { getDataset } from '@/lib/dashboard/engine/datasets';

describe('dashboard presets', () => {
  it('defines at least four presets', () => {
    expect(DASHBOARD_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('builds valid v2 dashboard docs with unique widget ids', () => {
    for (const preset of DASHBOARD_PRESETS) {
      const doc = preset.build();
      expect(doc.version).toBe(2);
      expect(doc.widgets.length).toBeGreaterThan(0);
      expect(Array.isArray(doc.slicers)).toBe(true);
      const ids = doc.widgets.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const w of doc.widgets) {
        expect(getDataset(w.datasetId)).toBeDefined();
        expect(w.query).toBeTruthy();
      }
    }
  });

  it('regenerates widget ids on each build', () => {
    const preset = getPreset('overview');
    expect(preset).toBeDefined();
    const a = preset!.build();
    const b = preset!.build();
    expect(a.widgets[0].id).not.toBe(b.widgets[0].id);
  });

  it('getPreset returns undefined for unknown id', () => {
    expect(getPreset('missing')).toBeUndefined();
  });
});
