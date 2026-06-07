# Agent instructions — Site Audit (WebsiteProfiling)

**What it is:** `python -m src` from repo root (`src/__main__.py` -> package **`website_profiling`**). Config: stored in **PostgreSQL** (`pipeline_config` table, `key/value/is_unknown/updated_at`). A shadow **`pipeline-config.txt`** is auto-written to `DATA_DIR` on every Save/Run. CLI loads DB first (`DATABASE_URL`), then shadow file; `--config` overrides with a file. Reference keys: `input.txt.example` and `pipeline-config.example.txt` (not auto-loaded).

**LLM / AI:** Settings live in **`llm_config`** table in PostgreSQL. Configure only via web UI **AI** tab (`GET/PUT /api/llm-config`, localhost). Never in `pipeline-config.txt` or `--config`.

**Frontend:** **`web/`** (Next.js) -- server reads PostgreSQL via `/api/report/*`.

**Key paths**

- `src/website_profiling/` -- `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `analysis/`, `llm/`, `tools/`
- `web/app/` -- routes; `web/src/` -- React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.ts`, `server/pipelineConfig.ts`, `server/llmConfig.ts`, `server/db.ts`
- `alembic/` -- schema migrations

**Local dev:** `./local-run` (Postgres in Docker `wp-pg`, Next.js on host). See `scripts/local-run.sh`. **Local tests (CI parity):** `./local-test` (100% in-scope coverage gate); `./local-test browser` for `@pytest.mark.browser` integration tests — see `scripts/local-test.sh`. Mocked browser unit tests: `tests/test_browser_fetcher_unit.py`.

**JavaScript crawl (optional):** Config keys `crawl_render_mode` (`static` | `javascript` | `auto`) and `crawl_js_*` in pipeline config / `pipelineConfigSchema.ts`. JS/auto crawls can capture browser console errors and uncaught exceptions (`crawl_js_capture_console`, stored under `page_analysis.browser`). **Auto mode** uses static-first fetch, pre-parse SPA heuristics (`needs_js_render`), then post-parse low-outlink fallback (`needs_js_render_after_parse`) in `crawler.py`. **Preflight:** `GET /api/crawl/browser-status` (localhost) spawns Python `browser_status()`; Run audit settings/run validation calls it when render mode is `javascript` or `auto`. Browser deps: `requirements-browser.txt` (installed by `./local-run setup` and `./local-test`). Runtime needs Chromium on `PATH` or `CHROME_PATH` (Docker sets `CHROME_PATH=/usr/bin/chromium`). Integration tests: `@pytest.mark.browser` — excluded by default in `pytest.ini`; Docker CI runs `tests/test_crawl_fetchers.py` and `tests/test_crawler_browser_e2e.py -m browser`; locally `./local-test browser`.

**Run / APIs**

- Run audit (CLI): `python -m src` — reads config from PostgreSQL (`pipeline_config`); shadow `DATA_DIR/pipeline-config.txt` if table empty. CLI override: `python -m src --config path`
- Optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich` | `google` | `chat`
- **`preserve_crawl_history`** (default true): append crawls; `false` truncates crawl tables but restores `report_payload`, Lighthouse, `google_data`, `keyword_data`, `keyword_history`, `keyword_suggest_cache`, and `crawl_runs`
- **`DATABASE_URL`** env: PostgreSQL connection string (required). **`DATA_DIR`**: secrets + shadow config (Docker: `/data`).
- **Pipeline data** (crawl, edges, nodes, report payload, Lighthouse, keywords, warnings) is stored in **PostgreSQL only** — no JSON/CSV/HTML exports from the main pipeline.
- **Pool tuning:** `DB_POOL_MIN` / `DB_POOL_MAX` (Python), `PGPOOL_MAX` (Node). Bulk crawl writes via `executemany`; optional **`crawl_stream_to_db`** streams rows during fetch.
- **`web/`:** `/api/report/*` (PostgreSQL); `/api/run` spawns Python (localhost only); `/api/crawl/browser-status` GET (localhost, Playwright/Chromium preflight); `/api/pipeline-config` GET/PUT; `/api/llm-config` GET/PUT (AI only); `/api/chat` POST (SSE agent); `/api/chat/sessions` GET/POST; `/api/properties/{id}/google/links/import` POST (GSC Links CSV); `PipelineRunnerFab` saves pipeline + LLM state before each run
- **MCP:** `python -m website_profiling.mcp` (stdio, read-only audit tools). See `docs/MCP.md`. Requires `pip install -r requirements-mcp.txt`.
- **AI Chat UI:** `/chat` — property-scoped chat with saved sessions (`chat_sessions`, `chat_messages` tables, migration `012_chat_sessions`).
- **Job store:** in-memory on `globalThis` in `web/src/server/pipelineJobs.ts` — job status/log is lost on server restart (single-process dev/Docker only).
- **Docker:** `Dockerfile` + `docker-compose.yml` (postgres + web); **`docker-compose.pull.yml`** for pre-built images (`WEB_IMAGE`); **`LIGHTHOUSE_CHROME_FLAGS`**

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py`, `crawl/fetchers/` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `alembic/versions/` |
| Local analysis | `analysis/local.py`, `requirements.txt` |
| AI insights (LLM) | `llm/enrich.py`, `llm/agent.py`, `llm_config.py`, `requirements-llm.txt` |
| Audit query tools (MCP + chat) | `tools/audit_tools/`, `mcp/server.py`, `commands/chat_cmd.py` |
| Config / CLI | `config.py` (`load_config`, `load_config_from_db`), `cli.py`, `input.txt.example` |
| UI pipeline schema | `web/src/lib/pipelineConfigSchema.ts` |
| UI LLM schema | `web/src/lib/llmConfigSchema.ts` |
| UI config I/O | `web/src/server/pipelineConfig.ts`, `web/src/server/llmConfig.ts` |

Schema changes: add Alembic migration (`alembic revision`).

**Company standards:** UI copy in `web/src/strings.json` (Site Audit, Properties, Run audit). Data provenance on `report_meta` in report payload. Docs: `docs/COMPANY_STANDARDS.md`, `docs/GLOSSARY.md`. Migration `003_company_standards` (properties, pipeline_jobs, audit_log). Durable jobs in `web/src/server/pipelineJobsDb.ts`. Export: `GET /api/report/export`, `src/website_profiling/tools/export_audit.py`.

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

**Checklist:** new report page uses `ReportShell` · no duplicate local imports in long functions · new `fetchone()` uses `_row_field`
