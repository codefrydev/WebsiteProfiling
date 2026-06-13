# Company Standards

This document defines data presentation requirements, crawl scope, and acceptable use for **Site Audit** (repository: WebsiteProfiling) in professional and agency contexts.

**Related documentation:** [README.md](../README.md) · [GLOSSARY.md](GLOSSARY.md) · [Documentation index](README.md)

---

## Purpose

Site Audit is an agency-grade technical SEO and site analysis platform. Reports must clearly distinguish measured data from estimates and third-party integrations. Category scores and heuristics must never be presented as guaranteed ranking or traffic outcomes.

---

## Data classification

All metrics displayed in the UI or exports must align with one of the following classes:

| Class | Definition | Examples |
|-------|------------|----------|
| **Measured** | Direct observation from HTTP crawl or Lighthouse | Status codes, title tags, LCP, response headers |
| **Search Console** | Data retrieved via Google Search Console API | Impressions, clicks, average position |
| **Analytics** | Data retrieved via Google Analytics 4 API | Sessions, users, engagement rate |
| **Estimated** | Heuristic derived when external APIs are unavailable | On-site keyword frequency, difficulty placeholders |
| **AI insight** | Optional LLM-generated content | Summaries, semantic clusters — always labeled |

**Audit category scores (0–100)** are internal prioritization scores. They are not Google rankings, PageRank, or predicted traffic impact.

---

## Crawl scope and rendering

| Mode | Config value | Behavior |
|------|--------------|----------|
| Static (default) | `crawl_render_mode = static` | HTTP GET with HTML parsing; no JavaScript execution |
| JavaScript | `crawl_render_mode = javascript` | Every page loaded in headless Chromium before parsing |
| Auto | `crawl_render_mode = auto` | Static fetch first; browser fallback when SPA heuristics or low outlink counts indicate client-rendered content |

**Rendering notes:**

- JavaScript mode is approximately 10–20× slower and more memory-intensive than static mode. It is required for many React, Vue, Next.js, Angular, Svelte, and Shopify implementations.
- Auto mode stores per-page `fetch_method` (`static` or `rendered`) on crawl rows for provenance.
- Static-only crawls may under-represent client-rendered links and single-page applications. Reports include crawl scope metadata: pages crawled versus limit, robots blocks, render mode, and browser diagnostic counts when applicable.
- JavaScript and auto modes require Playwright and Chromium. The Run audit UI validates availability via `GET /api/crawl/browser-status` before starting a job.

**Authorization:** Crawl only properties you own or have written permission to test. Respect `robots.txt` unless an administrator explicitly overrides for owned properties.

---

## Security scanning

| Mode | Config | Requirements |
|------|--------|--------------|
| Passive | Default | Analysis of response headers from crawl requests |
| Active | `security_scan_active` | Sends controlled probe requests — enable only with written authorization for the target property |

---

## Google integrations

- Use official product names in client-facing copy: **Google Search Console**, **Google Analytics 4**.
- Snapshots must include fetch time and date range.
- Stale or partial integration data must not appear as current without an explicit warning.

---

## Agency workflow

| Concept | Definition |
|---------|------------|
| **Property** | A client site grouped by canonical domain, with optional GSC/GA4 binding |
| **Audit run** | A stored report snapshot comprising crawl, analysis, and optional Lighthouse or Google data |
| **Export** | PDF, CSV, or HTML deliverable including a data source legend |

Category titles and issue copy in Python use agency vocabulary (`src/website_profiling/reporting/terminology.py`). See [GLOSSARY.md](GLOSSARY.md) for UI term mappings.

---

## Production requirements

| Requirement | Guidance |
|-------------|----------|
| Database credentials | Do not use default passwords in production (`POSTGRES_USER`, `POSTGRES_PASSWORD`) |
| Session auth | Set `AUTH_SECRET`; optionally `AUTH_USER`, `AUTH_PASSWORD`, `AUTH_DEFAULT_ROLE` |
| API access | Protect pipeline and integration endpoints when not bound to localhost |
| Backups | Back up PostgreSQL regularly — e.g. `pg_dump -Fc "$DATABASE_URL" > site-audit-$(date +%F).dump` |
| Client dashboards | `AUTH_DEFAULT_ROLE=client-readonly` (view + chat) or `viewer` (view only, no chat) |

---

## Continuous integration

Pull requests should pass:

- Python tests (three 100% coverage gates: core, reporting, tools)
- Web typecheck, lint, and Vitest
- Alembic migrations on an empty database
- Docker image build

Configuration: [.github/workflows/ci.yml](../.github/workflows/ci.yml). Branch protection on `master` with required CI checks is recommended.
