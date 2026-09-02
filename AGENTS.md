# Agent instructions — Site Audit (WebsiteProfiling)

> Developer reference for AI coding agents and contributors.

This file is the canonical entry point for agents. For full detail see [AGENT.md](AGENT.md).

**What it is:** Self-hosted SEO crawl and technical audit platform — `python -m src` from repo root. Stack: Python (crawl + analysis + FastAPI jobs/crawl API), Vite + React SPA (web UI), .NET BFF (browser API), .NET ReportService (report build + orchestration), .NET Data (reads), .NET AiService (AI/LLM/MCP), .NET IntegrationsService (Google/Bing I/O), PostgreSQL.

**Configuration:** Settings live in **typed PostgreSQL tables** (not EAV). Schema inventory: `config/typed_config_manifest.json`; parity tests in `tests/test_typed_config_schema_parity.py`. Python worker reads flat legacy keys via `src/website_profiling/db/typed_config/worker_config.py`.

**Key paths**

- `src/website_profiling/` — Python crawl/Lighthouse engine
  - `crawl/`, `lighthouse/`, `worker/`, `api/` (jobs, crawl, internal bridges), `reporting/` (bridge-only until C# port completes)
- `web/` — Vite + React SPA (static nginx in prod); browser calls `services/Bff/` for all `/api/*`
- `services/Bff/` — .NET BFF (auth, CORS, proxy to FastAPI + CoreService + AiService; port 8090)
- `services/CoreService/` — .NET core service (report build & orchestration, data queries & PDF/Excel exports, Google/Bing integrations; port 8094). See [services/CoreService/README.md](services/CoreService/README.md)
- `services/AiService/` — .NET AI service (Microsoft.Extensions.AI, chat, enrichment, MCP, **secrets/llm-settings writes**; port 8092). See [services/AiService/README.md](services/AiService/README.md)
- `services/Schema/` — EF Core DB migrations (schema owner)
- `services/WebsiteProfiling.slnx` — unified .NET solution (all services + shared libs)
- `docs/` — documentation index
- `tests/` — pytest suite

**Run / dev**

```bash
./local-run          # Start Postgres + CoreService + AiService + worker + FastAPI + BFF + Vite
./local-test         # Python + web + .NET tests (CI parity; dotnet: services/WebsiteProfiling.slnx)
python -m src        # Run audit pipeline
# MCP: AiService stdio/HTTP — see services/AiService/README.md and docs/MCP.md
```

**MCP:** 369 read-only audit tools via Model Context Protocol (AiService). See [docs/MCP.md](docs/MCP.md).

**Secrets / credentials:** Browser writes go BFF → AiService only (`PUT /api/secrets`, `PUT /api/llm-settings`). Python FastAPI keeps typed pipeline settings (`PUT /api/pipeline-config`, `GET/PUT /api/pipeline-settings`, `GET/PUT /api/ui-preferences`); worker/crawl reads typed settings from Postgres at runtime.

**Edit targets**

| Task | Where |
|------|-------|
| Crawl | `src/website_profiling/crawl/` |
| Report (native C#) | `services/CoreService/src/CoreService.Api/Application/Build/` |
| Data reads & exports | `services/CoreService/src/CoreService.Api/Rendering/`, `DataApplication/` |
| Integrations (Google/Bing) | `services/CoreService/src/CoreService.Api/Providers/Google/`, `IntegrationsApplication/` |
| Report (Python bridge) | `src/website_profiling/reporting/` |
| Typed settings / config | `config/typed_config_manifest.json`, `src/website_profiling/db/typed_config/` |
| GEO / AEO / Agent readiness | `src/website_profiling/tools/audit_tools/geo/geo_tools.py`, `geo/agent_readiness.py` |
| DB schema | `services/Schema/src/Schema.Model/` |
| UI | `web/src/views/`, `web/src/pages/`, `web/src/AppRoutes.tsx` |
| Report/card widgets (dev JSON copy) | `Card` `devData` prop — see [AGENT.md](AGENT.md) § Dev widget JSON copy; reference: `web/src/components/overview/OverviewExecutiveSummary.tsx` |
| Charts | D3: `web/src/components/charts/d3/`, `web/src/lib/viz/` · Chart.js: GSC/GA4/Links etc. — see [AGENT.md](AGENT.md) § Charts |

**Charts:** Use **both** Chart.js and D3 — choose per chart (Overview/Compare → D3; standard GSC/GA4 bars → Chart.js). Full rules in [AGENT.md](AGENT.md).

**Dev widget JSON copy:** In local dev, each report card/panel should pass `devData` on `Card` so agents/devs can copy the widget’s JSON from the top-right `{ }` button. Wire on every widget you add or touch; full conventions in [AGENT.md](AGENT.md) § Dev widget JSON copy.

**Common pitfalls:** See [AGENT.md](AGENT.md) for the full footguns checklist (React context, Python local imports, psycopg dict rows, coverage gates).
