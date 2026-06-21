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
| GEO / AEO / Agent readiness | `src/website_profiling/tools/audit_tools/geo/geo_tools.py`, `geo/agent_readiness.py` |
| DB schema | `alembic/versions/` |
| UI | `web/src/views/`, `web/app/` |
| Charts | D3: `web/src/components/charts/d3/`, `web/src/lib/viz/` · Chart.js: GSC/GA4/Links etc. — see [AGENT.md](AGENT.md) § Charts |

**Charts:** Use **both** Chart.js and D3 — choose per chart (Overview/Compare → D3; standard GSC/GA4 bars → Chart.js). Full rules in [AGENT.md](AGENT.md).

**Common pitfalls:** See [AGENT.md](AGENT.md) for the full footguns checklist (React context, Python local imports, psycopg dict rows, coverage gates).
