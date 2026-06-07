# Site Audit

Open-source technical SEO crawl and audit UI (Next.js + Python + PostgreSQL).

## Overview

**Why this project** — Most site-audit and SEO tools are paid, limited, or built to upsell: paywalls, capped crawls, teaser scores, and “subscribe to see how to fix this.” Many free options give shallow or unreliable reports that push you toward a paid plan instead of real answers.

**Goal** — A free, self-hosted audit you control: crawl your sites, see honest technical SEO issues, connect Search Console and Analytics when you want, and export reports for clients — without a vendor sitting between you and the data.

## Quick start

**Docker (build from source)**

```bash
docker compose up --build
```

Open [http://localhost:3000/home](http://localhost:3000/home).

**Docker (published image)**

The app requires PostgreSQL on the same Docker network. Do **not** run the image alone with `docker run` — the hostname `postgres` only resolves inside Compose.

```bash
docker pull your-registry/website-profiling:tag
export WEB_IMAGE=your-registry/website-profiling:tag
docker compose -f docker-compose.pull.yml up -d
```

Open [http://localhost:3000/home](http://localhost:3000/home).

**Local dev**

```bash
./local-run setup   # first time: Postgres, Python venv, migrations, npm deps
./local-run         # daily: start DB + Next.js dev server → http://localhost:3000/home
./local-run db      # Postgres only (no app)
./local-run migrate # apply Alembic migrations only
./local-run stop    # stop Postgres container
```

**Tests**

```bash
./local-test              # before push: full CI parity (DB + pytest + web)
./local-test python       # backend: pytest (80% coverage) + browser pytest + CLI smoke
./local-test browser      # JS crawl integration tests (skips if Chromium unavailable)
./local-test web          # frontend: typecheck, lint, vitest
./local-test quick        # fast loop; needs DB already up (no coverage gate)
./local-test all --no-cov # full run without pytest coverage gate
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and pull request guidelines.

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately

## Docs

- [AGENT.md](AGENT.md) — repo layout and dev commands
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — UI terminology
- [docs/COMPANY_STANDARDS.md](docs/COMPANY_STANDARDS.md) — data and security policy

Google Search Console / Analytics: connect via **Integrations** (gear icon) in the app.

**JavaScript crawl (optional):** In Audit settings, set **Crawl rendering** to `javascript` (always headless Chromium) or `auto` (static first, browser when SPA heuristics match). Install locally: `pip install -r requirements-browser.txt` and Chromium on `PATH` or `CHROME_PATH` (included in Docker). The UI preflights via `GET /api/crawl/browser-status` before runs when JS/auto is selected.

**AI Chat (optional):** Ask questions about your audit data at [http://localhost:3000/chat](http://localhost:3000/chat). Enable a provider under **Run audit → AI settings** (`llm_enabled`, provider, model). `./local-run setup` installs `requirements-llm.txt` (`httpx`, OpenAI, Anthropic SDKs).

| Provider | Notes |
|----------|--------|
| **Ollama** | Local daemon at `http://127.0.0.1:11434`. Chat UI lists installed models plus the live Ollama cloud catalog (billing: free local, account free tier, Pro). Native tool calling when supported; otherwise ReAct fallback. Pick the model in-chat without leaving the page. |
| **OpenAI** / **Anthropic** | API key in AI settings; native tool calling with streaming. |

The agent uses the same **121 read-only audit tools** as the MCP server (`docs/MCP.md`). Responses stream over SSE (`POST /api/chat`) with status, tool activity, and tokens. Sessions are saved per property (`chat_sessions` / `chat_messages`).

Production: `docker-compose.prod.yml` (set `POSTGRES_PASSWORD`, `AUTH_SECRET`).

## License

Copyright (c) 2026 [codefrydev](https://github.com/codefrydev). Released under the **MIT License** — see [LICENSE](LICENSE). Issues and pull requests: [codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling).
