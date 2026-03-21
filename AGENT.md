# Agent instructions — WebsiteProfiling

## Overview

Console app: crawl → SQLite / optional CSV, report payload JSON for the **React UI** (`UI/`, loads `report.db` via sql.js). Config: **`input.txt`** (paths relative to that file). Run: **`python -m src`** from repo root (`src/__main__.py` puts `src/` on `sys.path`, package is **`website_profiling`**).

## Layout (Python under `src/`)

```
src/
  __main__.py              # python -m src
  website_profiling/
    cli.py config.py common.py security_scanner.py
    crawl/crawler.py
    db/storage.py
    lighthouse/runner.py schema.py
    analysis/page.py
    ml/enrich.py
    reporting/builder.py categories.py
    tools/keywords.py warnings.py plot.py
UI/src/ …
```

## Run / data

- **Python:** core app works on 3.10+. **`requirements-ml.txt`** (spaCy/thinc/blis): use **3.12** locally to match CI; **3.13** may fail compiling `blis` during `pip install`.
- Pipeline: `python -m src` · steps: `crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich` · config: `--config path`
- No DB migrations: schema in `db/storage.py` `init_schema` only. `crawl_results` may be replace-only or per–`crawl_run_id` depending on config.
- UI: static + sql.js; no live backend for the default flow.

## Key edits

| Task | Where |
|------|--------|
| Crawl field | `crawl/crawler.py`, `reporting/builder.py`, UI if needed |
| Page analysis | `analysis/page.py` |
| Report / categories | `reporting/builder.py`, `reporting/categories.py` |
| ML (optional) | `ml/enrich.py`, `input.txt`, `requirements-ml.txt` |
| DB schema | `db/storage.py` `init_schema` |
| Config / CLI | `config.py`, `input.txt`, `cli.py` |
