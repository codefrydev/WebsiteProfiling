# Agent instructions — Site Audit (WebsiteProfiling)

Developer reference for agents and contributors. User-facing overview: [README.md](README.md). Full doc index: [docs/README.md](docs/README.md).

**What it is:** `python -m src` from repo root (`src/__main__.py` -> package **`website_profiling`**). Config: stored in **PostgreSQL** (`pipeline_config` table, `key/value/is_unknown/updated_at`). A shadow **`pipeline-config.txt`** is auto-written to `DATA_DIR` on every Save/Run. CLI loads DB first (`DATABASE_URL`), then shadow file; `--config` overrides with a file. Reference keys: `input.txt.example` and `pipeline-config.example.txt` (not auto-loaded).

**LLM / AI:** Settings live in **`llm_config`** table in PostgreSQL. Providers: OpenAI, Google Gemini, Anthropic, Groq, Ollama (`web/src/lib/llmConfigSchema.ts`). Configure only via web UI **AI** tab (`GET/PUT /api/llm-config`, localhost). Never in `pipeline-config.txt` or `--config`.

**Frontend:** **`web/`** (Next.js) -- server reads PostgreSQL via `/api/report/*`.

**Key paths**

- `src/website_profiling/` -- `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `analysis/`, `llm/`, `tools/`
- `web/app/` -- routes; `web/src/` -- React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.ts`, `server/pipelineConfig.ts`, `server/llmConfig.ts`, `server/db.ts`
- `alembic/` -- schema migrations

**Local dev:** `./local-run` (Postgres in Docker `wp-pg`, Next.js on host; default `DATABASE_URL`: `postgres://postgres:dev@127.0.0.1:5432/website_profiling`). See `scripts/local-run.sh`. **Local tests:** `./local-test` runs **three** Python coverage gates (core 100%, reporting 100%, tools 100%) plus web checks — mirrors CI **python** and **web** jobs; Docker CI is separate (see `.github/workflows/ci.yml`). `./local-test browser` for `@pytest.mark.browser` integration tests — see `scripts/local-test.sh`. Mocked browser unit tests: `tests/test_browser_fetcher_unit.py`.

**JavaScript crawl (optional):** Config keys `crawl_render_mode` (`static` | `javascript` | `auto`) and `crawl_js_*` in pipeline config / `pipelineConfigSchema.ts`. JS/auto crawls can capture browser console errors and uncaught exceptions (`crawl_js_capture_console`, stored under `page_analysis.browser`). **Auto mode** uses static-first fetch, pre-parse SPA heuristics (`needs_js_render`), then post-parse low-outlink fallback (`needs_js_render_after_parse`) in `crawler.py`. **Preflight:** `GET /api/crawl/browser-status` (localhost) spawns Python `browser_status()`; Run audit settings/run validation calls it when render mode is `javascript` or `auto`. Browser deps: Playwright from `requirements.txt` (installed by `./local-run setup` and `./local-test`). Runtime needs Chromium on `PATH` or `CHROME_PATH` (Docker sets `CHROME_PATH=/usr/bin/chromium`). Integration tests: `@pytest.mark.browser` — excluded by default in `pytest.ini`; Docker CI runs `tests/test_crawl_fetchers.py` and `tests/test_crawler_browser_e2e.py -m browser`; locally `./local-test browser`.

**Run / APIs**

- Run audit (CLI): `python -m src` — reads config from PostgreSQL (`pipeline_config`); shadow `DATA_DIR/pipeline-config.txt` if table empty. CLI override: `python -m src --config path`
- Optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich` | `google` | `chat`
- **`preserve_crawl_history`** (default true): append crawls; `false` truncates crawl tables but restores `report_payload`, Lighthouse, `google_data`, `keyword_data`, `keyword_history`, `keyword_suggest_cache`, and `crawl_runs`
- **`DATABASE_URL`** env: PostgreSQL connection string (required). **`DATA_DIR`**: secrets + shadow config (Docker: `/data`).
- **Pipeline storage** (crawl, edges, nodes, report payload, Lighthouse, keywords, warnings) lives in **PostgreSQL only**. Deliverables use the Export view, `GET /api/report/export`, or MCP `export_*` tools — not files written by the main pipeline step.
- **Pool tuning:** `DB_POOL_MIN` / `DB_POOL_MAX` (Python), `PGPOOL_MAX` (Node). Bulk crawl writes via `executemany`; optional **`crawl_stream_to_db`** streams rows during fetch. Per-URL raw HTML: `crawl_page_html` table (migration `015`); API `GET/POST /api/crawl/page-html` (localhost).
- **`web/` APIs:** `/api/report/*` read routes (payload, meta, history — not localhost-guarded; protect with `AUTH_*` when exposed); `/api/run` spawns Python (localhost); `/api/jobs`, `/api/jobs/[id]`, `/api/jobs/[id]/cancel` (localhost); `/api/crawl/browser-status`, `/api/crawl/page-html` (localhost); `/api/pipeline-config` GET/PUT; `/api/llm-config` GET/PUT; `/api/chat` POST (SSE); `/api/chat/sessions` GET/POST; `/api/ollama/status` (localhost); `/api/properties/{id}/google/links/import` POST; `PipelineRunnerFab` saves pipeline + LLM state before each run. Full route list: `web/app/api/**/route.ts`.
- **MCP:** `python -m website_profiling.mcp` (stdio) or `python -m website_profiling.mcp.http` (remote Streamable HTTP). Configure at **`/mcp`** in the web UI. See `docs/MCP.md`.
- **AI Chat UI:** `/chat` — property-scoped chat with saved sessions (`chat_sessions`, `chat_messages`; migration `012_chat_sessions`).
- **Job store:** PostgreSQL `pipeline_jobs` when `DATABASE_URL` is set (`pipelineJobsDb.ts` — status, timestamps, truncated logs). In-memory map in `pipelineJobs.ts` holds live log tail and child process handles; stale rows reconciled via `PIPELINE_JOB_STALE_HOURS`.
- **Schema head:** `015_crawl_page_html` (recent: `013` link_edges/discovery, `014` job log truncation, `015` per-URL HTML storage).
- **Docker:** `Dockerfile` + `docker-compose.yml` (postgres + web); **`docker-compose.prod.yml`** (production + remote MCP on `:8000`); **`docker-compose.pull.yml`** for pre-built images (`WEB_IMAGE`); **`LIGHTHOUSE_CHROME_FLAGS`**

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py`, `crawl/fetchers/` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `alembic/versions/` |
| Local analysis | `analysis/local.py`, `requirements.txt` |
| AI insights (LLM) | `llm/enrich.py`, `llm/agent.py`, `llm_config.py`, `requirements.txt` |
| Audit query tools (MCP + chat) | `tools/audit_tools/`, `mcp/server.py`, `mcp/http_server.py`, `commands/chat_cmd.py` |
| Agent readiness checks | `tools/audit_tools/geo/agent_readiness.py`, `tools/audit_tools/_aeo_helpers.py` |
| Config / CLI | `config.py` (`load_config`, `load_config_from_db`), `cli.py`, `input.txt.example` |
| UI pipeline schema | `web/src/lib/pipelineConfigSchema.ts` |
| UI LLM schema | `web/src/lib/llmConfigSchema.ts` |
| UI config I/O | `web/src/server/pipelineConfig.ts`, `web/src/server/llmConfig.ts` |
| D3 charts (custom / compare / overview) | `web/src/components/charts/d3/`, `web/src/lib/viz/` |
| Chart.js charts (standard bar/line/doughnut) | `web/src/utils/chartJsDefaults.ts`, `react-chartjs-2` in views under `web/src/views/`, `web/src/components/searchPerformance/`, `web/src/components/traffic/` |

Schema changes: add Alembic migration (`alembic revision`).

**Charts — Chart.js + D3 (hybrid)**

The web UI uses **both** Chart.js and D3.js. Pick the library that fits each chart; do not migrate everything to one stack.

| Prefer **Chart.js** when… | Prefer **D3** when… |
|---------------------------|---------------------|
| Standard bar, line, or doughnut with typical legend/tooltip/responsive canvas | Custom layout (grouped compare bars, dual lines with null gaps, arc gauges) |
| Quick add with minimal custom SVG | Tight theme control via CSS vars (`--chart-grid`, `--chart-title`, etc.) |
| Page already on Chart.js (GSC, GA4, Links, Content Analytics) | Reusing shared components in `web/src/components/charts/d3/` |
| Chart.js plugins or defaults are enough | Neutral data types + adapters in `web/src/lib/viz/` |

**Decision rule:** If a D3 component already exists (`D3GroupedBarChart`, `D3DualLineChart`, `D3VerticalBarChart`, `D3DonutChart`, compact charts, `arcGauge.ts`), reuse it. If it is a one-off standard chart on a Chart.js page, stay on Chart.js unless D3 clearly wins.

**Current split (indicative)**

| Area | Library |
|------|---------|
| Overview dashboard (`/dashboard`) | D3 |
| Compare (`/compare`) | D3 |
| Content analytics — Analytics tab (`/content-analytics?tab=analytics`) | D3 |
| GSC / GA4 / scatter (`GscCharts`, `Ga4Charts`) | Chart.js |
| Links explorer, Content Analytics, Text Content Analysis | Chart.js |
| Score rings, distribution donuts, compact sparklines | D3 |

**Conventions (both stacks)**

- Wrap charts in `ChartPanel`, `ChartAccessibleFallback`, and/or `ChartCard` where applicable.
- Theme helpers live in `web/src/utils/chartJsDefaults.ts` (`getGridColor`, `getChartTitleColor`, `truncateChartLabel`) — use them from D3 as well as Chart.js.
- Keep chart-library types out of data-prep: use neutral shapes (`BarChartData`, `DualSeriesChartData` in `web/src/lib/viz/types.ts` and `web/src/lib/compareChartData.ts`); convert at the render layer via `web/src/lib/viz/adapters.ts` when needed.
- Migrate page-by-page when D3 is the better fit; do not remove `chart.js` from `package.json` until all consumers are migrated.

**Company standards:** UI copy in `web/src/strings.json` (Site Audit, Properties, Run audit). Data provenance on `report_meta` in report payload. Docs: `docs/COMPANY_STANDARDS.md`, `docs/GLOSSARY.md`. Migration `003_company_standards` (properties, pipeline_jobs, audit_log). Durable jobs in `web/src/server/pipelineJobsDb.ts`. Export: PDF/workbook via FileService (`FILE_SERVICE_URL`); CSV/JSON via `GET /api/report/export` and `src/website_profiling/tools/export_audit.py`.

**Common footguns (check before finishing web or DB work)**

These recur when adding features. Verify explicitly — do not assume tests caught them.

1. **React context — `useReport` / `ReportProvider`**
   - Report views call `useReport()`. That only works inside `ReportAppClient` → `ReportProvider`.
   - **Do:** Render report views via `ReportShell` (wraps `ReportAppClient` internally).
   - **Don't:** Import a view directly in `app/*/page.tsx` without `ReportShell`.
   - Standalone routes under `web/app/` (e.g. `log-analyzer`, `indexation`) are **not** auto-wrapped by `(reports)/layout`.

   ```tsx
   // ✅
   import ReportShell from '@/ReportShell';
   export default function Page() {
     return <ReportShell slug="log-analyzer" />;
   }
   ```

2. **Python — local imports shadow module imports**
   - `from ..config import get_int` anywhere inside a function makes that name **local for the entire function**. Using it earlier → `UnboundLocalError`.
   - **Do:** Use the module-level import (see top of `reporting/builder.py`).
   - **Don't:** Re-import inside a function if the same name is used above that line in the same function.

3. **PostgreSQL rows — never `row[0]`**
   - Connections may use psycopg `dict_row`. `row[0]` → `KeyError: 0` on dict rows; tuple-only unit tests still pass.
   - **Do:** `_row_field(row, "id", index=0)` from `website_profiling.db._common` (pattern in `property_store.py`).
   - **Don't:** `fetchone()[0]` on `INSERT … RETURNING` without `_row_field`.

   ```python
   from ._common import _row_field
   row = cur.fetchone()
   rid = _row_field(row, "id", index=0)
   report_id = int(rid) if rid is not None else None
   ```

4. **Python — local vs CI coverage gates (three jobs, not one)**
   - CI runs **three separate** pytest coverage jobs (see `.github/workflows/ci.yml` and `scripts/local-test.sh`):
     | Gate | Config | Source | Threshold | Test scope |
     |------|--------|--------|-----------|------------|
     | Core | `.coveragerc` | all packages **except** `tools/` and `reporting/` | 100% | `pytest tests/ -m "not browser"` |
     | Reporting | `.coveragerc.reporting` | `website_profiling.reporting` | 100% | `pytest tests/reporting/` |
     | Tools | `.coveragerc.tools` | `website_profiling.tools` | 100% | `pytest tests/tools/` |
   - **Symptom:** `./local-test` or core pytest passes at 100%, but CI fails on tools/reporting (e.g. 84% tools).
   - **Causes:** (a) only ran core pytest, not reporting/tools gates; (b) added reporting/tools tests outside `tests/reporting/` or `tests/tools/`; (c) changed code under `website_profiling/tools/` without tests that hit those lines in the tools gate subset.
   - **Do:** Run full `./local-test` before push. Put reporting coverage tests in `tests/reporting/` and tools coverage tests in `tests/tools/` (one module per file, e.g. `test_<module>_coverage.py`). Keep bash and PowerShell local-test scripts in sync.
   - **Don't:** Assume `pytest tests/` alone matches CI. Don't maintain long per-file lists in CI — use the directory gates above.

5. **Python — `runpy.run_module` / `__main__` guard tests**
   - Tests that execute a module as `__main__` via `runpy.run_module(..., run_name="__main__")` emit:
     `RuntimeWarning: '<module>' found in sys.modules after import of package ...`
     when the same module was already imported at the top of the test file (or by another import).
   - **Do:** Before `runpy.run_module`, remove the target from `sys.modules` so Python re-executes `__main__` cleanly. Name tests `test_module_main_guard` (see `tests/test_schedule_runner.py`).
   - **Don't:** Call `runpy.run_module` on a module already imported in that test file without popping it first.

   ```python
   import runpy
   import sys

   sys.modules.pop("website_profiling.tools.schedule_runner", None)
   runpy.run_module(
       "website_profiling.tools.schedule_runner",
       run_name="__main__",
       alter_sys=False,
   )
   ```

**Checklist:** new report page uses `ReportShell` · no duplicate local imports in long functions · new `fetchone()` uses `_row_field` · `./local-test` passes all three coverage gates · new tools coverage test file listed in CI + both local-test scripts · `runpy` main-guard tests pop `sys.modules` first
