# Glossary

This glossary maps agency-facing UI terms to internal keys, database tables, and data sources. Use it when writing UI copy, client reports, or integration documentation.

**Related documentation:** [COMPANY_STANDARDS.md](COMPANY_STANDARDS.md) · [MCP.md](MCP.md) · [Documentation index](README.md)

---

## Report views and features

| UI term | Internal key / table | Data source | Comparable tools |
|---------|------------------------|-------------|------------------|
| Properties | Home portfolio, `properties` | User-defined; one Google OAuth + GSC/GA4 mapping per row | GA4 Property, GSC property |
| Audit run | `report_payload`, report list | Crawl + report build | Semrush Site Audit run |
| Overview | `overview` view | Report payload | Site Audit dashboard |
| Issues | `issues` view, `categories[].issues` | Rule engine on crawl + Lighthouse | Semrush Issues, Screaming Frog errors |
| All URLs | `links` view, crawl rows | HTTP crawl | Screaming Frog Internal URLs |
| URL structure | `site-structure` | Crawl graph | Screaming Frog directory tree |
| Redirects & chains | `redirects` | Crawl status + chains | Screaming Frog redirect chains |
| On-page SEO | `content` | Crawl meta/titles | Semrush On Page |
| Performance (Core Web Vitals) | `lighthouse`, `lighthouse_summary` | Lighthouse | PageSpeed Insights |
| Security | `security`, `security_findings` | Headers + optional probes | Sitebulb Security |
| Content quality | Category `content quality` (id: intelligence) | Crawl + analysis + optional AI insights | Duplicate/thin content audits |
| Technologies | `tech-stack` | Wappalyzer-style detection | BuiltWith |
| Crawl summary | `charts` | Crawl aggregates | Screaming Frog overview |
| Internal links | `network` | Link graph | Ahrefs Internal Links |
| Backlinks | `backlinks`, `gsc_links`, `gsc_links_data` | GSC Links CSV import | Google Search Console Links report |
| Page previews | `gallery`, `list_site_image_urls`, `image_inventory` | Crawl excerpts + optional HTTP probe | Visual QA |
| Search Console | `search-performance`, `google_data` (scoped by `property_id`) | GSC API per property | Google Search Console |
| Analytics (GA4) | `traffic`, `google_data` (scoped by `property_id`) | GA4 API per property | Google Analytics |
| Keywords | `keywords-explorer`, `keyword_data` | Crawl + Search Console + research | Keyword tools (site-scoped) |
| Compare audits | `compare` | Two report payloads | Historical comparison |
| Indexation & coverage | `indexation`, `indexation_coverage` | Crawl + sitemap + GSC URL join | Semrush indexability, GSC coverage |
| CrUX field CWV | `crux_summary` | Chrome UX Report API | PageSpeed field data |
| Executive summary | `executive_summary` | Issues + GSC + optional AI | Agency audit cover page |
| Run audit | Pipeline / `python -m src` | User-triggered job | Start site audit |
| Issue task board | `issues` view (board tab), `issue_status` | Workflow persistence per property | Issue triage board |
| Query–page alignment | `keywords-explorer` alignment tab, `query_page_misalignment` | Search Console heuristics | Landing-page targeting |
| Crawl segments | `site-structure` overview, `crawl_segments` | `crawl_path_segments` config + crawl | Section health rollups |
| Log analyzer | `log-analyzer` view | Uploaded access log vs crawl | Log file insights |
| Competitor link gap | `backlinks` overview, `competitor_link_gap` | GSC Links import + `competitor_domains` | Link gap analysis |
| Moz / Majestic overlay | `third_party_overlays` on `gsc_links`, `/api/backlinks/third-party-import` | CSV export upload | Referring-domain comparison vs GSC sample |
| Bing backlinks | `bing_backlinks`, Integrations sync | Bing Webmaster API (optional) | Secondary link source |
| SERP competition overlay | `serp_estimated_competition` on keywords | SerpAPI (optional) | Estimated SERP difficulty |
| Keyword Planner overlay | `planner_avg_monthly_searches`, `planner_competition`, `planner_competition_index`, `planner_provenance` on keyword rows | Google Ads API `KeywordPlanIdeaService` (optional; `enable_google_keyword_planner`) | Official market-level search volume + competition — does not overwrite GSC impressions |
| Keyword Planner discovery | New keyword rows with `sources: ["planner"]` | `GenerateKeywordIdeas` | Brand-new keywords not yet in crawl or GSC |
| Keyword Planner forecast | `planner_forecast_clicks`, `planner_forecast_conversions` on top rows | `GenerateKeywordForecastMetrics` v24 (`enable_keyword_forecast`) | Paid-campaign click/conversion forecast — clearly labelled, not organic traffic |
| Scheduled audits | `properties.schedule_cron`, `/api/schedule/check` | Cron + pipeline spawn | Recurring site audit — see [OPS.md](OPS.md) |
| Property alerts | `alert_webhook_url`, `/api/alerts/check` | Health snapshot rules | Operations notifications |
| Content brief | Keywords Brief button, `/api/keywords/content-brief` | LLM or deterministic | Content planning |
| AI fix suggestions | `llm_recommendation`, `/api/ai/fix-suggestion` | LLM on demand + report build | Actionable remediation |
| AI Chat | `/chat`, `/api/chat`, `chat_sessions` | LLM + read-only audit tools | Conversational audit queries |
| MCP tools | `python -m website_profiling.mcp` | Same `audit_tools` as chat | IDE integration — see [MCP.md](MCP.md) |
| Read-only session | `AUTH_DEFAULT_ROLE=client-readonly` or `viewer`; `/api/auth/session` returns role and mutation flags | Session cookie | `client-readonly`: view + chat; `viewer`: view only (no chat) |
| Export executive summary | Export view; MCP `export_audit_report` (pdf/csv/json); workbook via Export view or FileService | Report payload + optional AI | Client deliverable |
| ads.txt / security.txt | `site_level`, `get_ads_txt_status`, `get_security_txt_status` | Root file fetch at report build | Publisher / contact file hygiene |
| Subdomain inventory | `subdomains`, `list_subdomains`, `/subdomains` view | Crawl + GSC + optional crt.sh | Host footprint vs crawl scope |
| Contact intelligence | `contact_intelligence`, `get_contact_intelligence`, `/contacts` view | Crawl schema/mailto + security.txt + RDAP org | Business identity consistency |

---

## Metrics

| UI label | Field | Source |
|----------|-------|--------|
| Impact score | `impact_score` on issues | GSC clicks + GA4 sessions + priority weight |
| Link edges | `link_edges`, `link_rel_summary` | Crawl anchor/rel attributes |
| Outlinks | `outlinks` | Crawl graph |
| Status code | `status` | HTTP response |
| Crawl rendering | `crawl_render_mode` on run; `fetch_method` per URL | `static`, `javascript`, or `auto`; per-page `static` vs `rendered` |
| Impressions | `gsc_impressions` | Search Console |
| Referring domains | `top_linking_sites` | GSC Links CSV import |
| External links to site | `sample_links`, `latest_links` | GSC Links CSV import |
| Clicks | `gsc_clicks` | Search Console |
| CTR | `gsc_ctr` | Search Console |
| Average position | `gsc_position` | Search Console |
| On-site frequency | `volume` (heuristic) | Estimated from crawl |
| Sessions | GA4 metrics | Analytics |

### Impact score formula

```
impact_score = priority_weight + (gsc_clicks × 10) + (ga4_sessions × 5)
```

Priority weights: Critical = 1000, High = 100, Medium = 10, Low = 1.

**UI hints:** Metric explanations in the app (circled **?** tooltips on KPIs, table headers, and chart titles) are sourced from `web/src/strings.json` under `metricHelp`. Shared keys live in `metricHelp.shared.*` (e.g. `metricHelp.shared.impactScore`); view-specific keys under `metricHelp.views.{viewId}.*`. Keep glossary definitions and `metricHelp` copy aligned when changing formulas or data sources.

---

## Provenance badges

Every data point in the UI should display one of the following provenance labels where applicable:

| Badge | Meaning |
|-------|---------|
| Crawl | Spider or HTTP fetch data |
| Lighthouse | Lab performance audit |
| Search Console | Google Search Console API |
| Analytics | Google Analytics 4 API |
| Estimated | Heuristic; not sourced from Google |
| AI insights | LLM-generated content (optional) |

---

## Client-facing wording

Use industry-standard terms in UI copy and exports:

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

**Implementation:** Canonical category titles are defined in `src/website_profiling/reporting/terminology.py`. New audits use those names in `categories[].name`. Legacy report names are mapped in export and the web UI.
