# Agent instructions -- WebsiteProfiling

**What it is:** `python -m src` from repo root (`src/__main__.py` -> package **`website_profiling`**). Config: stored in **PostgreSQL** (`pipeline_config` table, `key/value/is_unknown/updated_at`). A shadow **`pipeline-config.txt`** is auto-written to `DATA_DIR` on every Save/Run. CLI loads DB first (`DATABASE_URL`), then shadow file; `--config` overrides with a file. Reference keys: `input.txt.example` (not auto-loaded).

**LLM / AI:** Settings live in **`llm_config`** table in PostgreSQL. Configure only via web UI **AI** tab (`GET/PUT /api/llm-config`, localhost). Never in `pipeline-config.txt` or `--config`.

**Frontend:** **`web/`** (Next.js) -- server reads PostgreSQL via `/api/report/*`.

**Key paths**

- `src/website_profiling/` -- `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `analysis/`, `llm/`, `tools/`
- `web/app/` -- routes; `web/src/` -- React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.js`, `server/pipelineConfig.js`, `server/llmConfig.js`, `server/db.js`
- `alembic/` -- schema migrations

**Run / APIs**

- Pipeline: `python -m src` — reads config from PostgreSQL (`pipeline_config`); shadow `pipeline-config.txt` if table empty. CLI override: `python -m src --config path`
- Optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich`
- **`preserve_crawl_history`** (default true): append crawls; `false` truncates crawl tables but restores `report_payload`, Lighthouse, `google_data`, `keyword_data`, `keyword_history`, `keyword_suggest_cache`, and `crawl_runs`
- **`DATABASE_URL`** env: PostgreSQL connection string (required). **`DATA_DIR`**: secrets + shadow config (Docker: `/data`).
- **Pipeline data** (crawl, edges, nodes, report payload, Lighthouse, keywords, warnings) is stored in **PostgreSQL only** — no JSON/CSV/HTML exports from the main pipeline.
- **Pool tuning:** `DB_POOL_MIN` / `DB_POOL_MAX` (Python), `PGPOOL_MAX` (Node). Bulk crawl writes via `executemany`; optional **`crawl_stream_to_db`** streams rows during fetch.
- **`web/`:** `/api/report/*` (PostgreSQL); `/api/run` spawns Python (localhost only); `/api/pipeline-config` GET/PUT; `/api/llm-config` GET/PUT (AI only); `PipelineRunnerFab` saves pipeline + LLM state before each run
- **Docker:** `Dockerfile` + `docker-compose.yml` (postgres + web); **`LIGHTHOUSE_CHROME_FLAGS`**

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `alembic/versions/` |
| Local analysis | `analysis/local.py`, `requirements.txt` |
| LLM enrichment | `llm/enrich.py`, `llm_config.py`, `requirements-llm.txt` |
| Config / CLI | `config.py` (`load_config`, `load_config_from_db`), `cli.py`, `input.txt.example` |
| UI pipeline schema | `web/src/lib/pipelineConfigSchema.js` |
| UI LLM schema | `web/src/lib/llmConfigSchema.js` |
| UI config I/O | `web/src/server/pipelineConfig.js`, `web/src/server/llmConfig.js` |

Schema changes: add Alembic migration (`alembic revision`).
