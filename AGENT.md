# Agent instructions -- WebsiteProfiling

**What it is:** `python -m src` from repo root (`src/__main__.py` -> package **`website_profiling`**). Config: stored in **`report.db`** (`pipeline_config` table, `key/value/is_unknown/updated_at`). A shadow **`pipeline-config.txt`** is auto-written next to `report.db` on every Save/Run. CLI loads DB first (`REPORT_DB_PATH` or `cwd/report.db`), then shadow file; `--config` overrides with a file. Reference keys: `input.txt.example` (not auto-loaded).

**Frontend:** **`web/`** (Next.js) -- server reads `report.db` via `/api/report/*`.

**Key paths**

- `src/website_profiling/` -- `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `ml/enrich.py`, `tools/`
- `web/app/` -- routes; `web/src/` -- React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.js`, `server/pipelineConfig.js`

**Run / APIs**

- Pipeline: `python -m src` — reads config from `report.db` (`pipeline_config`); shadow `pipeline-config.txt` if table empty. CLI override: `python -m src --config path`
- Optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich`
- **`preserve_crawl_history`** (default true): append crawls; `false` recreates crawl tables but restores `report_payload`, Lighthouse, `google_data`, `keyword_data`, `keyword_history`, `keyword_suggest_cache`, and `crawl_runs`
- **`enrich_keywords_after_report`**: when omitted or `auto` (UI: Auto), follows `enable_google_search_console`; when set to Yes/No, explicit override
- **`REPORT_DB_PATH`** env: DB path used by both Python and Next.js (Docker: `/data/report.db`; local default: `report.db` at repo root). Pipeline config lives in this DB.
- **`web/`:** `/api/report/*` (SQLite); `/api/run` spawns Python (localhost only); `/api/pipeline-config` GET/PUT for persistent settings; `PipelineRunnerFab` saves state to `report.db` (`pipeline_config` table) + shadow `pipeline-config.txt` before each run
- **Docker:** `Dockerfile` + `docker-compose.yml`; **`LIGHTHOUSE_CHROME_FLAGS`**; ML caches under `/data/cache/*` in compose

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `db/storage.py` `init_schema` |
| ML | `ml/enrich.py`, `requirements-ml.txt` |
| Config / CLI | `config.py` (`load_config`, `load_config_from_db`), `cli.py`, `input.txt.example` |
| UI config schema | `web/src/lib/pipelineConfigSchema.js` |
| UI config I/O | `web/src/server/pipelineConfig.js` |

Schema changes: edit `init_schema` only (no migration layer). ML stack: prefer Python **3.12** for spaCy/blis; **3.13** may fail pip builds.
