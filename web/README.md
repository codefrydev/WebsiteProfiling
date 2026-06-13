# Site Audit — Web UI

Next.js frontend for [Site Audit](../README.md). The app reads audit data from PostgreSQL and spawns the Python pipeline for crawl and report jobs.

## Development

Use the repo root scripts — do not run `npm run dev` in isolation unless Postgres is already up:

```bash
./local-run setup   # first time
./local-run         # http://localhost:3000/home
```

## Structure

| Path | Purpose |
|------|---------|
| `app/` | App Router pages and `/api` route handlers |
| `src/components/` | Shared React components |
| `src/views/` | Report views (overview, issues, links, …) |
| `src/server/` | DB access, pipeline jobs, config I/O |
| `src/lib/` | Schemas (`pipelineConfigSchema.ts`, `llmConfigSchema.ts`) |
| `public/` | Static assets (logo, favicon) |

## Commands

Run from `web/`:

```bash
npm run typecheck
npm run lint
npm test
```

Full CI parity from repo root: `./local-test web`.

## Further reading

- [README.md](../README.md) — setup and configuration
- [AGENT.md](../AGENT.md) — API routes, React footguns, where to edit
- [docs/GLOSSARY.md](../docs/GLOSSARY.md) — UI terminology (`web/src/strings.json`)
