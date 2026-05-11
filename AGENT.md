# Agent instructions — WebsiteProfiling

**What it is:** `python -m src` from repo root (`src/__main__.py` → package **`website_profiling`**). Config **`input.txt`**; relative paths resolve from the **config file’s directory** (`cli.py`).

**Frontends:** **`web/`** (Next.js, **recommended**) — server reads `report.db` via `/api/report/*`; **`UI/`** (legacy Vite) — sql.js in the browser.

**Key paths**

- `src/website_profiling/` — `cli.py`, `config.py`, `crawl/`, `db/storage.py`, `lighthouse/`, `reporting/`, `ml/enrich.py`, `tools/`
- `web/app/` — routes; `web/src/` — React; pipeline: `PipelineRunnerFab`, `server/pipelineJobs.js`

**Run / APIs**

- Pipeline: `python -m src` · optional step: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich` · `--config path`
- **`preserve_crawl_history`** (default true): append crawls; `false` recreates `report.db` but restores old `report_payload` / Lighthouse rows
- **`REPORT_DB_PATH`** env: when set, **`cli.py`** uses it for SQLite so it matches Next (e.g. Docker `/data/report.db`)
- **`web/`:** `/api/report/*` (SQLite); **`/api/run`** spawns Python (localhost Host only). FAB sends **`configContent`** → temp **`.website-profiling-ui-*.txt`** at **repo root** so `report.db` aligns with Next
- **Docker:** `Dockerfile` + `docker-compose.yml`; **`LIGHTHOUSE_CHROME_FLAGS`**; ML caches under `/data/cache/*` in compose

**Where to edit**

| Task | Where |
|------|--------|
| Crawl | `crawl/crawler.py` |
| Report | `reporting/builder.py`, `reporting/categories.py` |
| DB schema | `db/storage.py` `init_schema` |
| ML | `ml/enrich.py`, `requirements-ml.txt` |
| Config / CLI | `config.py`, `cli.py`, `input.txt` |

Schema changes: edit `init_schema` only (no migration layer). ML stack: prefer Python **3.12** for spaCy/blis; **3.13** may fail pip builds.
