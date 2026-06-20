# Agent instructions — Site Audit (WebsiteProfiling)

> Developer reference for AI coding agents and contributors.

This file is the canonical entry point for agents. For full detail see [AGENT.md](AGENT.md).

**What it is:** Self-hosted SEO crawl and technical audit platform — `python -m src` from repo root. Stack: Python (crawl + analysis + MCP), Next.js (web UI), PostgreSQL.

**Key paths**

- `src/website_profiling/` — core Python package
  - `cli.py`, `config.py`, `crawl/`, `db/`, `reporting/`, `analysis/`, `llm/`, `tools/`
- `web/` — Next.js frontend
- `alembic/` — DB migrations
- `docs/` — documentation index
- `tests/` — pytest suite

**Run / dev**

```bash
./local-run          # Start Postgres (Docker) + Next.js
./local-test         # Run all three coverage gates
python -m src        # Run audit pipeline
python -m website_profiling.mcp   # Start MCP server (stdio)
```

**MCP:** 340 read-only audit tools via Model Context Protocol. See [docs/MCP.md](docs/MCP.md).

**Edit targets**

| Task | Where |
|------|-------|
| Crawl | `src/website_profiling/crawl/` |
| Report | `src/website_profiling/reporting/` |
| GEO / AEO / Agent readiness | `src/website_profiling/tools/audit_tools/geo_tools.py`, `agent_readiness.py` |
| DB schema | `alembic/versions/` |
| UI | `web/src/views/`, `web/app/` |

**Common pitfalls:** See [AGENT.md](AGENT.md) for the full footguns checklist (React context, Python local imports, psycopg dict rows, coverage gates).
