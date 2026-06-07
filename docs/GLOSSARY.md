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
| Backlinks | `backlinks`, `gsc_links`, `gsc_links_data` | GSC Links CSV import (Google sample) | GSC Links report |
| Page previews | `gallery` | Crawl excerpts | Visual QA |
| Search Console | `search-performance`, `google_data` (scoped by `property_id`) | GSC API per property | Google Search Console |
| Analytics (GA4) | `traffic`, `google_data` (scoped by `property_id`) | GA4 API per property | Google Analytics |
| Keywords | `keywords-explorer`, `keyword_data` | Crawl + Search Console + research | Keyword tools (site-scoped) |
| Compare audits | `compare` | Two report payloads | Historical comparison |
| Indexation & coverage | `indexation`, `indexation_coverage` | Crawl + sitemap + GSC URL join | SEMrush indexability, GSC coverage |
| CrUX field CWV | `crux_summary` | Chrome UX Report API | PageSpeed field data |
| Executive summary | `executive_summary` | Issues + GSC + optional AI | Agency audit cover page |
| Run audit | Pipeline / `python -m src` | User-triggered job | Start site audit |
| Issue task board | `issues` view (board tab), `issue_status` | Workflow persistence per property | Jira-style triage |
| Query–page alignment | `keywords-explorer` alignment tab, `query_page_misalignment` | Search Console heuristics | Landing-page targeting |
| Crawl segments | `site-structure` overview, `crawl_segments` | `crawl_path_segments` config + crawl | Section health rollups |
| Log analyzer | `log-analyzer` view | Uploaded access log vs crawl | Log file insights |
| Competitor link gap | `backlinks` overview, `competitor_link_gap` | GSC Links import + `competitor_domains` | Link gap analysis |
| Moz / Majestic overlay | `third_party_overlays` on `gsc_links`, `/api/backlinks/third-party-import` | CSV export upload | Estimated referring-domain comparison vs GSC sample |
| Bing backlinks | `bing_backlinks`, Integrations sync | Bing Webmaster API (optional) | Secondary link source |
| SERP competition overlay | `serp_estimated_competition` on keywords | SerpAPI (optional) | Estimated SERP difficulty |
| Scheduled audits | `properties.schedule_cron`, `/api/schedule/check` | Cron + pipeline spawn | Recurring site audit — see [OPS.md](OPS.md) |
| Property alerts | `alert_webhook_url`, `/api/alerts/check` | Health snapshot rules | Ops notifications |
| Content brief | Keywords Brief button, `/api/keywords/content-brief` | LLM or deterministic | Content planning |
| AI issue fix | `llm_recommendation`, `/api/issues/fix-suggestion` | LLM on demand + report build | Actionable remediation |
| Read-only session | `AUTH_DEFAULT_ROLE=client-readonly`, `/api/auth/session` | Session cookie | Client view-only access |
| Export executive summary | `export_audit_html/pdf/csv`, `executive_summary` | Report payload + optional AI | Client deliverable |

## Metric names

| UI | Field | Source |
|----|-------|--------|
| Inlinks | `inlinks` | Crawl graph |
| Outlinks | `outlinks` | Crawl graph |
| Status code | `status` | HTTP |
| Crawl rendering | `crawl_render_mode` on run; `fetch_method` per URL | `static`, `javascript`, or `auto` crawl config; `static` vs `rendered` per page |
| Impressions | `gsc_impressions` | Search Console |
| Referring domains | `top_linking_sites` | GSC Links CSV import |
| External links to site | `sample_links`, `latest_links` | GSC Links CSV import |
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
