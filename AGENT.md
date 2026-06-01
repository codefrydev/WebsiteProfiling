# Agent instructions -- WebsiteProfiling

**What it is:** `python -m src` from repo root (`src/__main__.py` -> package **`website_profiling`**). Config: stored in **`report.db`** (`pipeline_config` table, `key/value/is_unknown/updated_at`). A shadow **`pipeline-config.txt`** is auto-written next to `report.db` on every Save/Run. CLI loads DB first (`REPORT_DB_PATH` or `cwd/report.db`), then shadow file; `--config` overrides with a file. Reference keys: `input.txt.example` (not auto-loaded).

**LLM / AI:** Settings live in **`llm_config`** table in the same `report.db`. Configure only via web UI **AI** tab (`GET/PUT /api/llm-config`, localhost). Never in `pipeline-config.txt` or `--config`.

**Frontend:** **`web/`** (Next.js) -- server reads `report.db` via `/api/report/*`.

**Key paths**

- `src/website_profiling/` -- `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `analysis/`, `llm/`, `tools/`
- `web/app/` -- routes; `web/src/` -- React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.js`, `server/pipelineConfig.js`, `server/llmConfig.js`

**Run / APIs**

- Pipeline: `python -m src` — reads config from `report.db` (`pipeline_config`); shadow `pipeline-config.txt` if table empty. CLI override: `python -m src --config path`
- Optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich`
- **`preserve_crawl_history`** (default true): append crawls; `false` recreates crawl tables but restores `report_payload`, Lighthouse, `google_data`, `keyword_data`, `keyword_history`, `keyword_suggest_cache`, and `crawl_runs`
- **`enrich_keywords_after_report`**: when omitted or `auto` (UI: Auto), follows `enable_google_search_console`; when set to Yes/No, explicit override
- **`REPORT_DB_PATH`** env: DB path used by both Python and Next.js (Docker: `/data/report.db`; local default: `report.db` at repo root). Pipeline config lives in this DB.
- **`web/`:** `/api/report/*` (SQLite); `/api/run` spawns Python (localhost only); `/api/pipeline-config` GET/PUT; `/api/llm-config` GET/PUT (AI only); `PipelineRunnerFab` saves pipeline + LLM state before each run
- **Docker:** `Dockerfile` + `docker-compose.yml`; **`LIGHTHOUSE_CHROME_FLAGS`**

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `db/storage.py` `init_schema` |
| Local analysis | `analysis/local.py`, `requirements.txt` |
| LLM enrichment | `llm/enrich.py`, `llm_config.py`, `requirements-llm.txt` |
| Config / CLI | `config.py` (`load_config`, `load_config_from_db`), `cli.py`, `input.txt.example` |
| UI pipeline schema | `web/src/lib/pipelineConfigSchema.js` |
| UI LLM schema | `web/src/lib/llmConfigSchema.js` |
| UI config I/O | `web/src/server/pipelineConfig.js`, `web/src/server/llmConfig.js` |

Schema changes: edit `init_schema` only (no migration layer).
