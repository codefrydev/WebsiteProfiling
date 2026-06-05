# Glossary

UI terms agencies recognize, mapped to internal keys and data sources.

| UI term | Internal key / table | Data source | Similar tools |
|---------|----------------------|-------------|---------------|
| Properties | Home portfolio, `properties` | User-defined; one Google OAuth + GSC/GA4 mapping per row | GA4 Property, GSC property |
| Audit run | `report_payload`, report list | Crawl + report build | Semrush Site Audit run |
| Overview | `overview` view | Report payload | Site Audit dashboard |
| Issues | `issues` view, `categories[].issues` | Rule engine on crawl + Lighthouse | Semrush Issues, SF errors |
| All URLs | `links` view, crawl rows | HTTP crawl | Screaming Frog Internal URLs |
| URL structure | `site-structure` | Crawl graph | SF directory tree |
| Redirects & chains | `redirects` | Crawl status + chains | SF redirect chains |
| On-page SEO | `content` | Crawl meta/titles | Semrush On Page |
| Performance (Core Web Vitals) | `lighthouse`, `lighthouse_summary` | Lighthouse | PageSpeed Insights |
| Security | `security`, `security_findings` | Headers + optional probes | Sitebulb Security |
| Content quality | Category `content quality` (id: intelligence) | Crawl + analysis + optional AI insights | Duplicate/thin content audits |
| Technologies | `tech-stack` | Wappalyzer-style detection | BuiltWith |
| Crawl summary | `charts` | Crawl aggregates | SF overview |
| Internal links | `network` | Link graph | Ahrefs Internal Links |
| Page previews | `gallery` | Crawl excerpts | Visual QA |
| Search Console | `search-performance`, `google_data` (scoped by `property_id`) | GSC API per property | Google Search Console |
| Analytics (GA4) | `traffic`, `google_data` (scoped by `property_id`) | GA4 API per property | Google Analytics |
| Keywords | `keywords-explorer`, `keyword_data` | Crawl + Search Console + research | Keyword tools (site-scoped) |
| Compare audits | `compare` | Two report payloads | Historical comparison |
| Run audit | Pipeline / `python -m src` | User-triggered job | Start site audit |

## Metric names

| UI | Field | Source |
|----|-------|--------|
| Inlinks | `inlinks` | Crawl graph |
| Outlinks | `outlinks` | Crawl graph |
| Status code | `status` | HTTP |
| Crawl rendering | `crawl_render_mode` on run; `fetch_method` per URL | `static`, `javascript`, or `auto` crawl config; `static` vs `rendered` per page |
| Impressions | `gsc_impressions` | Search Console |
| Clicks | `gsc_clicks` | Search Console |
| CTR | `gsc_ctr` | Search Console |
| Average position | `gsc_position` | Search Console |
| On-site frequency | `volume` (heuristic) | Estimated from crawl |
| Sessions | GA4 metrics | Analytics |

## Provenance badges

| Badge | Meaning |
|-------|---------|
| Crawl | Spider/fetch data |
| Lighthouse | Lab performance audit |
| Search Console | Google Search Console API |
| Analytics | Google Analytics 4 API |
| Estimated | Heuristic, not from Google |
| AI insights | LLM-generated content (optional) |

## Client-facing wording

Prefer industry-standard terms in UI copy:

| Avoid | Prefer |
|-------|--------|
| Pipeline, runner, workflow | Run audit, audit type |
| URL fingerprint | URL / on-page changes |
| PageRank (without context) | Internal link score (this crawl) |
| Enrichment | Keyword expansion / research |
| AI enrichment | AI insights |
| Crawl preview / rebuild audit | Crawl only / regenerate audit from crawl |
| Inspector | URL details |
| Heuristic (alone) | Estimated from crawl |

Python stores canonical category titles in `src/website_profiling/reporting/terminology.py`. New audits use those names in `categories[].name`; older audits may still have legacy names (mapped in export and the web UI).
