import fs from 'fs';
import * as lu from '../src/utils/linkUtils.js';

const bundle = {
  contentUrlKeys: lu.CONTENT_URL_KEYS,
  contentLabels: lu.CONTENT_LABELS,
  contentRecommendations: lu.CONTENT_RECOMMENDATIONS,
  seoIssueRecommendations: lu.SEO_ISSUE_RECOMMENDATIONS,
};
fs.writeFileSync(new URL('../src/_linkutils_extract.json', import.meta.url), JSON.stringify(bundle, null, 2));
console.log('wrote _linkutils_extract.json');
