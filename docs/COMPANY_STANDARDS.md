# Company standards

WebsiteProfiling (UI: **Site Audit**) is an agency-grade technical SEO and site analysis tool. This document defines how data must be presented and how the product may be used in a professional context.

## Data classification

| Class | Meaning | Examples |
|-------|---------|----------|
| **Measured** | Direct observation from HTTP crawl or Lighthouse | Status codes, title tags, LCP, header presence |
| **Search Console** | Google Search Console API | Impressions, clicks, average position |
| **Analytics** | Google Analytics 4 API | Sessions, users, engagement rate |
| **Estimated** | Heuristic when external APIs are unavailable | On-site keyword frequency, fixed difficulty placeholder |
| **AI insight** | LLM enrichment (optional) | Summaries, semantic clusters — always labeled |

Audit category scores (0–100) are **internal audit scores**, not Google rankings or guaranteed traffic impact.

## Crawl limitations

- Crawl uses **HTTP GET + static HTML parsing** only (no JavaScript execution). See [Docs.md](../Docs.md).
- Client-rendered links and SPAs may be under-represented; reports must show crawl scope (pages crawled vs limit, robots blocks).
- Only crawl sites you are **authorized** to test. Respect `robots.txt` unless an admin explicitly overrides for owned properties.

## Security scanning

- **Passive** checks use crawl response headers (default).
- **Active** probes (`security_scan_active`) send controlled requests — enable only with written authorization for the target property.

## Google integrations

- Use official names in client-facing copy: **Google Search Console**, **Google Analytics 4**.
- Snapshots include fetch time and date range; stale or partial data must not appear as current without a warning.

## Agency workflow

- **Properties** group client sites (canonical domain, optional GSC/GA4 binding).
- An **audit run** is a stored report snapshot (crawl + analysis + optional Lighthouse/Google).
- Exports (PDF/CSV) include a data source legend.
- Category titles and issue copy in Python use agency vocabulary (`src/website_profiling/reporting/terminology.py`); see [GLOSSARY.md](GLOSSARY.md).

## Production expectations

- Do not use default database passwords in production.
- Protect pipeline and integration APIs with authentication when not on localhost.
- Back up PostgreSQL regularly (`pg_dump` — see [README.md](../README.md)).

## CI and releases

- All PRs should pass Python tests, web typecheck/lint/test, migrations on empty DB, and Docker image build (see `.github/workflows/ci.yml`).
- Prefer branch protection on `master`: require CI checks before merge.
