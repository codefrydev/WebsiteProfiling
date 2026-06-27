# Site Audit — Web UI

Vite + React SPA for [Site Audit](../README.md). The browser talks to the .NET **BFF** (`services/Bff/`) for all `/api/*` calls; the BFF proxies to FastAPI, AiService, Data, and FileService.

## Development

Use the repo root scripts — do not run `npm run dev` in isolation unless Postgres, FastAPI, AiService, and the BFF are already up:

```bash
./local-run setup   # first time
./local-run         # Vite on http://localhost:3000, BFF on :8090
```

Env (optional): copy `web/.env.example` to `web/.env.local` and set `VITE_BFF_BASE_URL`.

## Structure

| Path | Purpose |
|------|---------|
| `index.html` | HTML shell (theme bootstrap script) |
| `src/main.tsx` | Vite entry — `BrowserRouter` + providers |
| `src/AppRoutes.tsx` | React Router route table |
| `src/views/` | Report views (overview, issues, links, …) |
| `src/components/` | Shared React components |
| `src/lib/publicBase.ts` | BFF base URL + `apiFetch` / `apiUrl` |
| `public/` | Static assets (logo, favicon) |

## Commands

Run from `web/`:

```bash
npm run dev          # Vite dev server (:3000)
npm run build        # Production build → dist/
npm run preview      # Serve dist/ locally
npm run typecheck
npm run lint
npm test
```

Production image: `web/Dockerfile` (build → nginx serving `dist/`).

Full CI parity from repo root: `./local-test web`.

## Further reading

- [README.md](../README.md) — setup and configuration
- [AGENT.md](../AGENT.md) — API surface (BFF), React footguns, where to edit
- [docs/GLOSSARY.md](../docs/GLOSSARY.md) — UI terminology (`web/src/strings.json`)
