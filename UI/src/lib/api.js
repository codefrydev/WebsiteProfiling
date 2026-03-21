const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/** Map UI date presets to analytics `days` query param. */
export function daysFromRange(range) {
  const m = { '7d': 7, '28d': 28, '30d': 30, '90d': 90, '6m': 180, '1y': 365 };
  return m[range] ?? 30;
}

export const api = {
  async request(method, path, data = null, params = null) {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') url.searchParams.set(k, String(v));
      });
    }
    const headers = { 'Content-Type': 'application/json' };
    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);
    const res = await fetch(url.toString(), options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const d = err.detail;
      const msg = Array.isArray(d) ? d.map((e) => e.msg || e).join(', ') : d || `API error: ${res.status}`;
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  },
  get: (path, params) => api.request('GET', path, null, params),
  post: (path, data, params) => api.request('POST', path, data, params),
  put: (path, data, params) => api.request('PUT', path, data, params),
  patch: (path, data) => api.request('PATCH', path, data),
  delete: (path, params) => api.request('DELETE', path, null, params),
};

export const projectsApi = {
  list: () => api.get('/projects'),
  create: (data) => api.post('/projects', data),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
};

export const rankTrackerApi = {
  getKeywords: (projectId, params = {}) => api.get('/rank-tracker/keywords', { project_id: projectId, ...params }),
  addKeywords: (projectId, data) => api.post('/rank-tracker/keywords', data, { project_id: projectId }),
  deleteKeyword: (id) => api.delete(`/rank-tracker/keywords/${id}`),
  checkNow: (projectId) => api.post('/rank-tracker/check', null, { project_id: projectId }),
  getHistory: (projectId, params = {}) => api.get('/rank-tracker/history', { project_id: projectId, ...params }),
  getVisibility: (projectId, params = {}) => api.get('/rank-tracker/visibility', { project_id: projectId, ...params }),
  getCannibalization: (projectId, params = {}) => api.get('/rank-tracker/cannibalization', { project_id: projectId, ...params }),
  getSerpSnapshot: (keywordId) => api.get(`/rank-tracker/serp/${keywordId}`),
};

export const keywordsApi = {
  research: (data) =>
    api.post('/keywords/research', {
      seed: data.keyword || data.seed,
      location: data.location || 'United States',
      limit: data.limit ?? 100,
    }),
  search: (params) => api.get('/keywords/search', params),
  cluster: (projectId, data) => api.post('/keywords/cluster', data, { project_id: projectId }),
  getSerp: (params) => api.get('/keywords/serp', params),
  aiSuggestions: (data) => api.post('/keywords/suggestions/ai', data),
  questions: (params) => api.get('/keywords/questions', params),
  related: (params) => api.get('/keywords/related', params),
  export: (projectId, params = {}) => api.get('/keywords/export', { project_id: projectId, ...params }),
};

export const siteExplorerApi = {
  getOverview: (domain) => api.get(`/site-explorer/overview/${domain}`),
  getBacklinks: (domain, params) => api.get(`/site-explorer/backlinks/${domain}`, params),
  getReferringDomains: (domain, params) => api.get(`/site-explorer/referring-domains/${domain}`, params),
  getOrganicKeywords: (domain, params) => api.get(`/site-explorer/organic-keywords/${domain}`, params),
  getPaidKeywords: (domain, params) => api.get(`/site-explorer/paid-keywords/${domain}`, params),
  getBrokenBacklinks: (domain) => api.get(`/site-explorer/broken-backlinks/${domain}`),
  getContentGap: (params) => api.get('/site-explorer/content-gap', params),
  getLinkIntersect: (params) => api.get('/site-explorer/link-intersect', params),
  getAnchorText: (domain) => api.get(`/site-explorer/anchor-text/${domain}`),
  fetchFresh: (domain) => api.post(`/site-explorer/fetch/${domain}`),
};

export const siteAuditApi = {
  getProjects: () => api.get('/site-audit/projects'),
  createProject: (projectId, data) =>
    api.post('/site-audit/projects', null, {
      project_id: projectId,
      url: data.url,
      max_pages: data.max_pages ?? 500,
    }),
  getIssues: (params) => api.get('/site-audit/issues', params),
  getIssuesSummary: (params) => api.get('/site-audit/issues/summary', params),
  getCrawls: (params) => api.get('/site-audit/crawls', params),
  compareCrawls: (params) => api.get('/site-audit/crawls/compare', params),
  startCrawl: (projectId, data) =>
    api.post('/site-audit/crawls/start', null, {
      project_id: projectId,
      url: data.url,
      max_pages: data.max_pages ?? 500,
    }),
  generateSitemap: (params) => api.get('/site-audit/sitemap', params),
  analyzeLogFile: (projectId, formData) => {
    const url = new URL(`${BASE_URL}/site-audit/log-file`);
    url.searchParams.set('project_id', String(projectId));
    return fetch(url.toString(), { method: 'POST', body: formData }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }
      return res.json();
    });
  },
};

export const gscApi = {
  getProperties: (projectId) => api.get('/gsc/properties', { project_id: projectId }),
  addProperty: (data) =>
    api.post('/gsc/properties', {
      project_id: data.project_id,
      site_url: data.site_url || data.url,
    }),
  deleteProperty: (id) => api.delete(`/gsc/properties/${id}`),
  sync: (propId) => api.post(`/gsc/sync/${propId}`),
  getOverview: (propId, params = {}) =>
    api.get(`/gsc/overview/${propId}`, { days: params.days ?? daysFromRange(params.range) }),
  getQueries: (propId, params = {}) =>
    api.get(`/gsc/queries/${propId}`, { days: params.days ?? daysFromRange(params.range) }),
  getPages: (propId, params = {}) =>
    api.get(`/gsc/pages/${propId}`, { days: params.days ?? daysFromRange(params.range) }),
  getDevices: (propId, params = {}) =>
    api.get(`/gsc/devices/${propId}`, { days: params.days ?? daysFromRange(params.range) }),
  getCountries: (propId, params = {}) =>
    api.get(`/gsc/countries/${propId}`, { days: params.days ?? daysFromRange(params.range) }),
  getCannibalization: (propId) => api.get(`/gsc/cannibalization/${propId}`),
  getLowHangingFruit: (propId) => api.get(`/gsc/low-hanging-fruit/${propId}`),
  getDecay: (propId) => api.get(`/gsc/decay/${propId}`),
};

export const analyticsApi = {
  getOverview: (projectId, params = {}) =>
    api.get('/analytics/overview', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getPages: (projectId, params = {}) =>
    api.get('/analytics/pages', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getSources: (projectId, params = {}) =>
    api.get('/analytics/sources', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getDevices: (projectId, params = {}) =>
    api.get('/analytics/devices', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getGeo: (projectId, params = {}) =>
    api.get('/analytics/geo', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getRealtime: (projectId) => api.get('/analytics/realtime', { project_id: projectId }),
  getAiTraffic: (projectId, params = {}) =>
    api.get('/analytics/ai-traffic', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getBots: (projectId, params = {}) =>
    api.get('/analytics/bots', {
      project_id: projectId,
      days: params.days ?? daysFromRange(params.range),
    }),
  getFunnels: (projectId) => api.get('/analytics/funnels', { project_id: projectId }),
  createFunnel: (projectId, data) => api.post('/analytics/funnels', data, { project_id: projectId }),
  getFunnelAnalysis: (id, projectId) => api.get(`/analytics/funnels/${id}`, { project_id: projectId }),
};

export const contentApi = {
  explorer: (params) => api.get('/content/explorer', params),
  score: (projectId, data) => api.post('/content/score', data, { project_id: projectId }),
  getInventory: (projectId, params = {}) => api.get('/content/inventory', { project_id: projectId, ...params }),
  syncInventory: (projectId) => api.post('/content/inventory/sync', null, { project_id: projectId }),
  getDecay: (projectId, params = {}) => api.get('/content/inventory/decay', { project_id: projectId, ...params }),
  generateBrief: (data) => api.post('/content/ai/brief', data),
  generateDraft: (data) => api.post('/content/ai/draft', data),
  generateMeta: (data) => api.post('/content/ai/meta', data),
  optimize: (data) => api.post('/content/ai/optimize', data),
  chat: (data) => api.post('/content/ai/chat', data),
  topicResearch: (projectId, params = {}) =>
    api.get('/content/topic-research', { project_id: projectId, ...params }),
  buildClusters: (projectId, urls) =>
    api.post('/content/clusters', { urls }, { project_id: projectId }),
};

export const brandRadarApi = {
  getMentions: (projectId, params = {}) => api.get('/brand-radar/mentions', { project_id: projectId, ...params }),
  scanWeb: (projectId, data) => api.post('/brand-radar/mentions/scan', data, { project_id: projectId }),
  getAiCitations: (projectId, params = {}) =>
    api.get('/brand-radar/ai-citations', { project_id: projectId, ...params }),
  scanAi: (projectId, data) => api.post('/brand-radar/ai-citations/scan', data, { project_id: projectId }),
  getPrompts: (projectId) => api.get('/brand-radar/ai-citations/prompts', { project_id: projectId }),
  addPrompt: (projectId, data) => api.post('/brand-radar/ai-citations/prompts', data, { project_id: projectId }),
  getShareOfVoice: (projectId, params) =>
    api.get('/brand-radar/share-of-voice', { project_id: projectId, ...params }),
  getCompetitors: (projectId, params) =>
    api.get('/brand-radar/competitors', { project_id: projectId, ...params }),
};

export const competitiveApi = {
  getTraffic: (domain, params) => api.get(`/competitive/traffic/${domain}`, params),
  compare: (data) => api.post('/competitive/compare', data),
  keywordGap: ({ domains, target, competitors }) => {
    const list = typeof domains === 'string' ? domains.split(',').map((d) => d.trim()).filter(Boolean) : domains;
    const tgt = target || list[0];
    const comps = competitors || list.slice(1).join(',');
    return api.get('/competitive/keyword-gap', { target: tgt, competitors: comps });
  },
  backlinkGap: ({ domains, target, competitors }) => {
    const list = typeof domains === 'string' ? domains.split(',').map((d) => d.trim()).filter(Boolean) : domains;
    const tgt = target || list[0];
    const comps = competitors || list.slice(1).join(',');
    return api.get('/competitive/backlink-gap', { target: tgt, competitors: comps });
  },
  batchAnalysis: (projectId, data) => api.post('/competitive/batch-analysis', data, { project_id: projectId }),
  getBatchResults: (id) => api.get(`/competitive/batch-analysis/${id}`),
  getSegments: (projectId) => api.get('/competitive/market-segments', { project_id: projectId }),
  createSegment: (projectId, data) => api.post('/competitive/market-segments', data, { project_id: projectId }),
};

export const socialApi = {
  getAccounts: (projectId) => api.get('/social/accounts', { project_id: projectId }),
  connectAccount: (data) => api.post('/social/accounts/connect', data),
  disconnectAccount: (id) => api.delete(`/social/accounts/${id}`),
  getPosts: (projectId, params = {}) => api.get('/social/posts', { project_id: projectId, ...params }),
  createPost: (data) => api.post('/social/posts', data),
  updatePost: (id, data) => api.put(`/social/posts/${id}`, data),
  deletePost: (id) => api.delete(`/social/posts/${id}`),
  publishPost: (id) => api.post(`/social/posts/${id}/publish`),
  getAnalytics: (projectId) => api.get('/social/analytics', { project_id: projectId }),
  getCalendar: (projectId) => api.get('/social/calendar', { project_id: projectId }),
  findInfluencers: (projectId, params = {}) => api.get('/social/influencers', { project_id: projectId, ...params }),
};

export const advertisingApi = {
  getPpcKeywords: (projectId, params = {}) => api.get('/advertising/keywords', { project_id: projectId, ...params }),
  researchPpc: (params) => api.get('/advertising/ppc-research', { keyword: params.keyword, location: params.location }),
  getCompetitorAds: (domain) => api.get(`/advertising/competitors/${encodeURIComponent(domain)}`),
  generateCopy: (data) => api.post('/advertising/ai/copy', data),
  getAdHistory: (domain) => api.get('/advertising/competitor-ads', { domain }),
};

export const localSeoApi = {
  getProfiles: (projectId) => api.get('/local-seo/profiles', { project_id: projectId }),
  addProfile: (data) => api.post('/local-seo/profiles', data),
  updateProfile: (id, data) => api.put(`/local-seo/profiles/${id}`, data),
  deleteProfile: (id) => api.delete(`/local-seo/profiles/${id}`),
  syncProfile: (id) => api.post(`/local-seo/profiles/${id}/sync`),
  getRankHistory: (projectId, params = {}) => api.get('/local-seo/rank-history', { project_id: projectId, ...params }),
  getReviews: (profileId, params = {}) => api.get('/local-seo/reviews', { profile_id: profileId, ...params }),
  respondToReview: (reviewId, data) => api.post(`/local-seo/reviews/${reviewId}/respond`, data),
  suggestResponse: (data) => api.post('/local-seo/reviews/ai-suggest', data),
  getCitations: (projectId, params = {}) => api.get('/local-seo/citations', { project_id: projectId, ...params }),
  scanCitations: (data) => api.post('/local-seo/citations/scan', data),
  getHeatmap: (profileId) => api.get(`/local-seo/heatmap/${profileId}`),
};

export const reportingApi = {
  getPortfolios: () => api.get('/reporting/portfolios'),
  createPortfolio: (data) => api.post('/reporting/portfolios', data),
  getPortfolio: (id) => api.get(`/reporting/portfolios/${id}`),
  updatePortfolio: (id, data) => api.put(`/reporting/portfolios/${id}`, data),
  deletePortfolio: (id) => api.delete(`/reporting/portfolios/${id}`),
  getPortfolioMetrics: (id) => api.get(`/reporting/portfolios/${id}/metrics`),
  getTemplates: () => api.get('/reporting/templates'),
  createTemplate: (data) =>
    api.post('/reporting/templates', null, { name: data.name, description: data.description }),
  updateTemplate: (id, data) =>
    api.put(`/reporting/templates/${id}`, null, { name: data.name, description: data.description }),
  deleteTemplate: (id) => api.delete(`/reporting/templates/${id}`),
  generateReport: (data) => api.post('/reporting/reports/generate', data),
  getReports: () => api.get('/reporting/reports'),
  getScheduled: () => api.get('/reporting/scheduled'),
  createScheduled: (data) =>
    api.post('/reporting/scheduled', null, {
      template_id: data.template_id,
      frequency: data.frequency,
      project_id: data.project_id,
    }),
  deleteScheduled: (id) => api.delete(`/reporting/scheduled/${id}`),
};

export const alertsApi = {
  getAlerts: (projectId) => api.get('/alerts/', { project_id: projectId }),
  createAlert: (data) => api.post('/alerts/', data),
  updateAlert: (id, data) => api.put(`/alerts/${id}`, data),
  deleteAlert: (id) => api.delete(`/alerts/${id}`),
  getHistory: (projectId, params = {}) => api.get('/alerts/history', { project_id: projectId, ...params }),
  testAlert: (id) => api.post(`/alerts/${id}/test`),
};

export const settingsApi = {
  get: () => api.get('/settings/'),
  bulkSet: (obj) => api.post('/settings/bulk', obj),
  setKey: (key, value) =>
    api.put(`/settings/${encodeURIComponent(key)}`, null, {
      value: value === undefined || value === null ? '' : String(value),
    }),
  getAuditLog: (params) => api.get('/settings/audit-log', params),
  exportDownload: async (format = 'json') => {
    const url = new URL(`${BASE_URL}/settings/export`);
    url.searchParams.set('format', format);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const d = err.detail;
      const msg = Array.isArray(d) ? d.map((e) => e.msg || e).join(', ') : d || `API error: ${res.status}`;
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename=([^;\s]+)/);
    const filename =
      (m && m[1]) || `websiteprofiling-settings.${format === 'csv' ? 'csv' : 'json'}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

export const jobsApi = {
  list: (params) => api.get('/jobs/', params),
  get: (id) => api.get(`/jobs/${id}`),
};
