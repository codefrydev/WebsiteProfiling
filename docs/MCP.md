# MCP Server Reference

Site Audit exposes **369 read-only tools** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). The MCP server runs in **AiService** (.NET) — see [services/AiService/README.md](../services/AiService/README.md).

- **stdio:** `dotnet run --project services/AiService/src/AiService.Api` with stdio MCP host (see AiService.Mcp)
- **HTTP:** set `WP_MCP_HTTP=1` on AiService → endpoint `/mcp` (port 8092 by default)

The same tool catalog powers in-app **AI Chat** at `/chat` (also served by AiService via the BFF).

**Related documentation:** [GLOSSARY.md](GLOSSARY.md) · [Documentation index](README.md)

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Domain-scoped servers](#domain-scoped-servers)
- [Configuration](#configuration)
- [Remote Streamable HTTP](#remote-streamable-http)
- [MCP resources](#mcp-resources)
- [Tool reference](#tool-reference)
- [In-app chat](#in-app-chat)
- [Provider notes](#provider-notes)
- [Roadmap](#roadmap)
- [Example prompts](#example-prompts)

---

## Prerequisites

[.NET SDK 10+](https://dotnet.microsoft.com/download), Postgres, and `./local-run` (or AiService + FastAPI manually). AiService needs FastAPI on `:8096` for the audit-tool bridge until all tools are native C#.

```bash
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling  # Docker default
# ./local-run default: postgres://postgres:dev@127.0.0.1:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8096
```

### Local stdio (IDE subprocess)

From the repo root, with Postgres running:

```bash
cd services/AiService
export DATABASE_URL=postgres://postgres:dev@127.0.0.1:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8096
dotnet run --project src/AiService.Api
```

For a dedicated stdio MCP host, use `AddAiServiceMcpStdioHost()` (see `AiService.Mcp/McpServerExtensions.cs`). `./local-run` starts AiService with **`WP_MCP_HTTP=1`** so HTTP MCP is available at **http://localhost:8092/mcp**.

For remote access over HTTP, see [Remote Streamable HTTP](#remote-streamable-http).

---

## Domain-scoped servers

Rather than loading all 369 tools in a single server, Site Audit supports **domain-scoped bundles**. Connect only the domains relevant to your workflow.

| `WP_MCP_DOMAIN` | Tool count | Scope | Recommended use |
|-----------------|------------|-------|-----------------|
| `core` (default) | Tier 0 + `core`/`insight` domains | Router, workflows, insight | General queries, tool search, coverage reports |
| `crawl` | Domain subset | Crawl, on-page, schema, accessibility | Technical crawl audits |
| `google` | Domain subset | Google, insight, CTR, keywords | GSC/GA4 analysis |
| `links` | Domain subset | Links, backlinks, indexation | Link architecture |
| `full` | 369 | All tools | Debugging, legacy single-server setup |

Tier 0 alone includes 16 router/insight tools. Use the `audit://tools` resource or `WP_MCP_DOMAIN=full` for the complete catalog.

Set `WP_PROPERTY_ID` to the default property when tools omit an explicit `property_id` argument.

---

## Configuration

### Multi-domain setup (recommended)

Add to `.cursor/mcp.json` or your MCP client settings (stdio — spawn AiService; ensure Postgres and FastAPI are up):

```json
{
  "mcpServers": {
    "site-audit-core": {
      "command": "dotnet",
      "args": ["run", "--project", "services/AiService/src/AiService.Api", "--no-launch-profile"],
      "env": {
        "DATABASE_URL": "postgres://postgres:dev@127.0.0.1:5432/website_profiling",
        "FASTAPI_URL": "http://127.0.0.1:8096",
        "WP_MCP_DOMAIN": "core",
        "WP_PROPERTY_ID": "1"
      }
    },
    "site-audit-google": {
      "command": "dotnet",
      "args": ["run", "--project", "services/AiService/src/AiService.Api", "--no-launch-profile"],
      "env": {
        "DATABASE_URL": "postgres://postgres:dev@127.0.0.1:5432/website_profiling",
        "FASTAPI_URL": "http://127.0.0.1:8096",
        "WP_MCP_DOMAIN": "google",
        "WP_PROPERTY_ID": "1"
      }
    }
  }
}
```

### Single-server setup (all tools)

```json
{
  "mcpServers": {
    "site-audit": {
      "command": "dotnet",
      "args": ["run", "--project", "services/AiService/src/AiService.Api", "--no-launch-profile"],
      "env": {
        "DATABASE_URL": "postgres://postgres:dev@127.0.0.1:5432/website_profiling",
        "FASTAPI_URL": "http://127.0.0.1:8096",
        "WP_MCP_DOMAIN": "full",
        "WP_PROPERTY_ID": "1"
      }
    }
  }
}
```

---

## Remote Streamable HTTP

Use this when Site Audit runs on a hosted server and your MCP client (Cursor, Claude Desktop, etc.) connects over the network instead of spawning a local stdio subprocess.

### Start the HTTP server

Configure access on **MCP settings** (`/mcp`) in the web UI (recommended), or set environment variables on **AiService**. `./local-run` and Docker Compose set `WP_MCP_HTTP=1` on AiService (`:8092`). Production compose can publish host port `8000` → AiService `8092` via the `mcp` profile.

```bash
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8096
export ASPNETCORE_URLS=http://0.0.0.0:8092
export WP_MCP_HTTP=1
export WP_MCP_DOMAIN=core
export WP_PROPERTY_ID=1

cd services/AiService && dotnet run --project src/AiService.Api
```

Set **MCP bearer token** and **Allowed hostnames** on the Secrets page (or via `WP_MCP_TOKEN` / `WP_MCP_ALLOWED_HOSTS`). Environment variables override saved values when set.

The MCP endpoint is **`http://<host>:8092/mcp`** locally (`8092` is AiService's default port). With `docker-compose.prod.yml --profile mcp`, the host port defaults to **`8000`** mapped to AiService `8092`.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WP_MCP_HTTP` | unset | Set `1` on AiService to expose `/mcp` |
| `ASPNETCORE_URLS` | `http://+:8092` | AiService bind address |
| `WP_MCP_TOKEN` | unset | Bearer token (**required** when not binding localhost). Save on **Secrets → Remote MCP** or set here (env wins). |
| `WP_MCP_ALLOWED_HOSTS` | unset | Comma-separated `Host` allowlist (**required** for non-localhost bind). Save on **Secrets → Remote MCP** or set here. |
| `WP_MCP_ALLOWED_ORIGINS` | unset | Comma-separated `Origin` allowlist for browser clients |
| `WP_MCP_DOMAIN` | `core` | Tool bundle (same as stdio) |
| `WP_PROPERTY_ID` | unset | Default property (same as stdio) |

**Security:** `WP_MCP_TOKEN` is required when AiService is reachable outside localhost. Tools are read-only but expose audit, GSC, and GA4 data — treat the token like a database credential.

**DNS rebinding protection:** When a token **and** allowed hosts are configured — via the UI **or** environment variables — AiService enforces the bearer token plus the Host/Origin allowlist. Set `WP_MCP_ALLOWED_HOSTS` to the public hostname clients use (e.g. `audit.example.com`).

### Cursor / Claude Desktop (remote)

```json
{
  "mcpServers": {
    "site-audit-remote": {
      "url": "https://audit.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-long-random-token"
      }
    }
  }
}
```

### Docker (production)

The `mcp` service in `docker-compose.prod.yml` includes an `mcp` service. Set `WP_MCP_TOKEN` and `WP_MCP_ALLOWED_HOSTS` in the environment **or** configure them on **Secrets → Remote MCP** after deploy.

Terminate TLS at your reverse proxy and route `/mcp` to the MCP container. Recommended proxy settings: `proxy_buffering off`, long `proxy_read_timeout`.

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Server refuses to start | Missing token or allowed hosts on non-localhost bind (Secrets page or env) |
| 401 Unauthorized | Wrong or missing `Authorization: Bearer` header |
| 404 Not Found | Wrong path — endpoint is `/mcp` by default |
| Blocked / bad request behind proxy | Host not listed in allowed hostnames (Secrets → Remote MCP) |
| Connection refused | Firewall, wrong port, or MCP service not running |

---

## MCP resources

| URI | Content |
|-----|---------|
| `audit://properties` | JSON list of properties |
| `audit://property/{id}` | Property details and latest report summary |
| `audit://property/{id}/report/latest` | Payload key index (counts, not full blob) |
| `audit://property/{id}/report/{report_id}` | Payload key index for a specific report |
| `audit://glossary` | Excerpt from [GLOSSARY.md](GLOSSARY.md) |
| `audit://tools` | Tool catalog for the connected `WP_MCP_DOMAIN` |
| `audit://domains` | Available MCP domain bundles and tool groupings |

---

## Tool reference

All tools are read-only. This section is a **curated subset** of the 340-tool registry. For the complete catalog, connect with `WP_MCP_DOMAIN=full` or read the `audit://tools` MCP resource.

Export tools write artifact files with a 24-hour TTL; in-app chat renders download buttons via `/api/chat/artifacts/{id}`.

### Router and insight (Tier 0 — included in every chat turn)

`search_audit_tools`, `list_tool_domains`, `get_data_coverage_report`, `run_insight_workflow`, `run_technical_workflow`, `run_keyword_workflow`, `run_domain_agent`, `get_report_summary`, `list_top_impact_issues`, `prioritize_fix_roadmap`, `get_landing_page_blended_table`, `get_opportunity_matrix`, `get_traffic_health_check`, `get_landing_page_full_diagnosis`, `get_issue_to_traffic_map`, `get_google_summary`

### Export and deliverables

`export_audit_report`, `export_compare_csv`, `export_list_as_csv`, `export_sitemap_xml`, `validate_rich_results`, `list_export_formats`

| Deliverable | Generator | Env / notes |
|-------------|-----------|-------------|
| PDF | **FileService** (`GET /v1/reports/{id}/pdf`) | `FILE_SERVICE_URL` on MCP/web (default `http://127.0.0.1:8097`); FileService must be running |
| Excel workbook | **FileService** (`GET /v1/reports/{id}/workbook`) | Same as PDF |
| CSV / JSON audit export | Python (`export_audit_report`, `GET /api/report/export`) | Reads Postgres via report payload — no FileService required |
| Compare / list CSV | Python | `export_compare_csv`, `export_list_as_csv` |

FileService fetches report JSON over HTTP only (`REPORT_API_URL` → `/api/report/payload`, `/api/report/meta`, `/api/app-settings`). See [services/FileService/README.md](../services/FileService/README.md).

### Image audit

`get_image_audit_summary`, `list_pages_without_lazy_images`, `list_pages_with_images_missing_dimensions`, `list_site_image_urls`, `list_lighthouse_image_opportunities`, `list_largest_images`, `list_unoptimized_images`, `list_images_needing_attention`

Size-based tools require `probe_image_inventory=true` in pipeline config. Related keys: `max_image_probe_urls` (default 500), `image_probe_concurrency`, `image_probe_timeout`, `image_unoptimized_min_kb` (default 200).

### Portfolio and report

`list_properties`, `get_property`, `get_report_summary`, `get_category_scores`, `get_executive_summary`, `get_report_meta`, `get_site_level`, `list_report_history`, `get_audit_recommendations`, `get_ml_errors`, `get_ssl_expiry_info`, `list_audit_categories`, `get_category_recommendations`, `get_crawl_summary`, `get_portfolio_summary`

### Issues and workflow

`list_issues`, `search_issues`, `list_top_impact_issues`, `prioritize_fix_roadmap`, `list_issues_by_category`, `get_category_issues`, `list_issue_workflow`, `list_issues_with_ai_fixes`, `generate_issue_fix`, `summarize_category_for_client`, `list_seo_onpage_issues`

### On-page SEO

`list_content_url_issues`, `list_pages_missing_title`, `list_pages_missing_h1`, `list_pages_multiple_h1`, `list_pages_missing_meta_description`, `list_pages_meta_desc_too_short`, `list_pages_meta_desc_too_long`, `list_pages_noindex`, `get_seo_health`, `list_pages_missing_canonical`, `list_canonical_mismatch`, `list_pages_with_missing_alt`, `list_pages_skipped_headings`, `list_pages_missing_viewport`, `list_pages_missing_og_image`

### Crawl and pages

`search_pages`, `search_pages_advanced`, `get_page_details`, `get_page_analysis`, `get_internal_links`, `list_redirects`, `list_broken_links`, `list_status_4xx_pages`, `list_status_5xx_pages`, `list_pages_soft_404`, `list_dead_end_pages`, `list_duplicate_title_groups`, `list_heavy_pages_by_bytes`, `list_pages_poor_cache_headers`, `list_pages_low_content_ratio`, `get_heading_outline_for_url`, `get_status_code_breakdown`, `get_response_time_stats`, `get_depth_distribution`, `get_crawl_segments`, `get_browser_diagnostics_summary`, `list_pages_with_console_errors`, `list_pages_by_fetch_method`, `get_crawl_links_table`, `get_graph_edges_sample`, `list_long_redirect_chains`, `list_robots_blocked_urls`, `get_top_pages_by_pagerank`, `get_pagination_audit_summary`, `get_js_rendering_delta`

### Accessibility and assets

`list_pages_with_axe_violations`, `get_axe_audit_summary`, `list_pages_with_mixed_content`, `get_asset_weight_summary`, `get_readability_summary`

### Rich results and portfolio extras

`get_rich_results_summary`, `list_rich_results_failures`, `get_competitor_keyword_gap`, `get_portfolio_benchmark`, `get_site_anchor_text_summary`

### Schema and technical

`get_schema_coverage`, `list_pages_without_schema`, `search_pages_by_schema_type`, `get_tech_stack_summary`, `list_pages_by_technology`, `get_security_findings`, `get_security_findings_summary`, `list_security_findings_by_type`

### Links and architecture

`get_link_rel_summary`, `get_inlink_anchors`, `list_nofollow_internal_links`, `list_orphan_pages`, `get_top_linked_pages`, `get_top_crawled_pages`, `get_outbound_link_domains`, `get_link_graph_summary`, `get_url_fingerprints`, `list_broken_link_sources`, `get_mime_type_breakdown`, `get_title_length_distribution`, `get_domain_link_distribution`, `get_outlink_distribution`

### Indexation and international

`get_indexation_coverage`, `list_indexation_gaps`, `get_indexation_url_join`, `get_hreflang_summary`, `get_language_summary`

### Content and social

`get_content_analytics`, `get_content_duplicates`, `get_duplicate_cluster`, `get_social_coverage`, `get_keyword_opportunities`, `get_ner_site_summary`, `list_thin_content_pages`

### Keywords

`get_keyword_summary`, `search_keywords`, `get_striking_distance_keywords`, `get_keyword_cannibalisation`, `get_query_page_misalignment`, `get_semantic_keyword_clusters`, `get_keyword_history`, `get_keyword_serp_overlay`, `get_serp_feature_overlay`, `list_keywords_by_action`, `list_keywords_by_position`, `list_keywords_by_impressions`, `list_keywords_ctr_opportunity`, `expand_keywords`, `generate_content_brief`, `get_brand_keyword_split`, `list_keywords_by_intent`

### Google and CTR

`get_google_summary`, `get_google_integration_status`, `get_gsc_top_queries`, `get_gsc_top_pages`, `get_gsc_ctr_opportunity_pages`, `get_ga4_summary`, `get_ga4_page_metrics`, `get_gsc_page_query_slice`, `get_gsc_url_inspection`, `get_gsc_index_coverage`, `analyze_serp_snippet_for_url`, `get_gsc_daily_trend`, `get_ga4_daily_trend`, `get_ga4_by_device`, `get_ga4_by_channel`, `get_gsc_page_queries`

### Backlinks

`get_gsc_links_summary`, `get_gsc_links_import_status`, `get_gsc_sample_links`, `get_gsc_latest_links`, `get_third_party_links_overlay`, `get_backlinks_velocity`, `get_competitor_link_gap`, `get_bing_backlinks_summary`

### Performance

`get_lighthouse_summary`, `get_lighthouse_for_url`, `get_lighthouse_human_summary`, `get_lighthouse_diagnostics`, `get_crux_summary`, `list_slow_pages`, `list_lighthouse_poor_seo_pages`, `list_lighthouse_poor_accessibility_pages`, `list_lighthouse_poor_best_practices_pages`, `list_lighthouse_cwv_failures`

### Drift, health, and compare

`get_health_history`, `get_category_health_history`, `compare_reports`, `compare_issue_deltas`, `compare_category_deltas`, `compare_seo_health_deltas`, `compare_lighthouse_deltas`, `compare_url_set_diff`, `compare_redirect_deltas`, `compare_link_metric_deltas`, `compare_security_deltas`, `compare_duplicate_deltas`, `compare_tech_deltas`, `compare_content_metrics`, `compare_google_metrics`, `compare_priority_counts`, `compare_health_score_delta`, `compare_indexation_deltas`, `compare_orphan_deltas`

### GEO / AEO

`get_geo_readiness_score`, `get_aeo_content_signals_for_url`, `get_llms_txt_status`, `draft_llms_txt`, `get_faq_schema_coverage`, `list_pages_missing_faq_schema`, `get_eeat_signals_summary`, `get_internal_link_suggestions`, `check_ai_citation_presence`

### Agent documentation readiness (agentic-seo parity)

`get_agent_readiness_score` — 5-category composite score (0-100, A-F grade): discovery, content structure, token economics, capability signaling, UX bridge.

**Discovery:** `get_agents_md_status`, `get_skill_md_status`, `get_agent_permissions_status`

**Token economics:** `get_token_budget_summary`, `list_oversized_pages_for_agents`

**Content structure:** `get_content_structure_aeo_summary`, `get_markdown_availability_summary`, `list_pages_agent_unfriendly`

**UX bridge:** `get_copy_for_ai_signals`, `list_pages_missing_copy_for_ai`

**Generator:** `generate_agent_readiness_bundle` — draft AGENTS.md, skill.md, agent-permissions.json

**Example prompts:**
- "Score this site's agent documentation readiness"
- "Which pages are over the 8k token limit for AI agents?"
- "Does this site have an AGENTS.md or skill.md?"
- "Generate agent readiness files for my site"

### Integrations

`get_bing_index_status` (requires `bing_webmaster_api_key` in audit settings)

### Operations and logs

`get_integration_alerts`, `get_property_ops`, `list_crawl_runs`, `list_log_uploads`, `get_latest_log_analysis`, `get_log_top_paths`, `list_log_only_paths`, `list_crawl_only_paths`, `get_log_googlebot_stats`, `get_log_analysis_by_id`, `get_page_coach`

---

## In-app chat

The same tools power **AI Chat** at [http://localhost:3000/chat](http://localhost:3000/chat). Enable a provider under **Run audit → AI settings**.

In-app chat uses **dynamic tool routing**: each turn loads Tier 0 router tools plus a domain-scoped subset (default ~45 tools via `CHAT_TOOL_MAX`). Set `CHAT_TOOL_MODE=full` to load all tools for debugging. Optional: `CHAT_TOOL_MAX` (default 45, max 120).

Responses stream over SSE via `POST /api/chat`. Sessions persist per property in `chat_sessions` and `chat_messages`.

**Optional crawl actions:** When **Allow chat to start crawls** is enabled under **Run audit → Settings → Content & AI → Chat agent**, the chat agent can guide crawl setup and call `prepare_audit_run` to show an in-chat confirm card. The user must authorize crawling and click **Run audit** — the agent never spawns jobs directly. MCP tools remain read-only; `prepare_audit_run` is chat-only and excluded from MCP bundles.

---

## Provider notes

| Provider | Tool calling | Notes |
|----------|--------------|-------|
| **Ollama** | Native when supported; ReAct fallback otherwise | Local daemon at `http://127.0.0.1:11434` |
| **OpenAI** | Native with streaming | API key in AI settings or `OPENAI_API_KEY` |
| **Anthropic** | Native with streaming | API key in AI settings or `ANTHROPIC_API_KEY` |
| **Google Gemini** | Native with streaming | API key in AI settings or `GEMINI_API_KEY`; REST via `httpx` |
| **Groq** | Native with streaming | API key in AI settings or `GROQ_API_KEY`; official Groq Python SDK; default model `openai/gpt-oss-120b` |

---

## Roadmap

The following capabilities are planned but not yet available:

| Capability | Current state |
|------------|---------------|
| Full backlink index and anchor-text analytics | GSC Links CSV import only |
| SERP rank tracking | GSC position snapshots only |
| Live AI citation checks | On-site heuristics via `check_ai_citation_presence` |

**Already available:** `validate_rich_results`, `get_gsc_url_inspection`, `export_sitemap_xml`, workbook export, axe audits via `enable_axe` on browser crawls.

---

## Example prompts

| Goal | Example prompt |
|------|----------------|
| Indexation | "What indexation gaps exist between crawl and GSC?" |
| On-page | "List pages missing canonical tags or with canonical mismatches" |
| Log analysis | "Which paths appear in access logs but were not crawled?" |
| Google data | "Compare GSC clicks vs the previous audit" |
| Performance | "List pages failing Core Web Vitals thresholds" |
| Security | "Show security finding changes since report 38" |
| Links | "Which pages link to broken URLs?" |
| Content | "Generate a content brief for keyword X" |
| Export | "Download the audit as PDF" or "Export the crawl workbook as Excel" |
| Compare | "Compare report 38 to the current audit and give me a CSV diff" |
| Client report | "Build a client report with executive summary, category scores, and top critical issues as PDF" |
| Images | "Which images are largest and unoptimized?" |
| Prioritization | "What should we fix first on high-traffic pages?" |
| GEO | "What's our GEO readiness score?" |
| GSC inspection | "Inspect GSC indexing for https://example.com/page" |
| Crawl quality | "Which pages are soft 404s or dead ends?" |
| Internal links | "Suggest internal links for our top blog post" |
| Accessibility | "List pages with images missing alt or lazy loading" |
