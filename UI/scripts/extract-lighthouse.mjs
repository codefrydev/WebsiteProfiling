import fs from 'fs';
import * as lh from '../src/utils/lighthouseUtils.js';

const bundle = {
  metricThresholds: lh.METRIC_THRESHOLDS,
  categories: lh.CATEGORIES,
  categoryLabels: lh.CATEGORY_LABELS,
  impactGroups: lh.IMPACT_GROUPS,
  quickWins: lh.QUICK_WINS,
};
fs.writeFileSync(new URL('../src/_lighthouse_extract.json', import.meta.url), JSON.stringify(bundle, null, 2));
console.log('wrote _lighthouse_extract.json');
