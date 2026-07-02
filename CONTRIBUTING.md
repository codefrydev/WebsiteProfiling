# Contributing to Site Audit

Thank you for helping improve this project. All contributions are welcome under the [MIT License](LICENSE).

**Source:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

## Before you start

- Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Only crawl or audit sites you are authorized to test ([docs/COMPANY_STANDARDS.md](docs/COMPANY_STANDARDS.md)).
- For security issues, see [SECURITY.md](SECURITY.md) (do not open public issues for vulnerabilities).

## Development setup

```bash
./local-run setup   # once: Postgres, Python venv, migrations, npm deps
./local-run         # dev server → http://localhost:3000/home
```

Details: [README.md](README.md), [AGENT.md](AGENT.md), [docs/README.md](docs/README.md).

JavaScript/auto crawl needs Playwright (from `requirements.txt`, installed by `./local-run setup`) and Chromium on `PATH` or `CHROME_PATH`. Unit tests mock the browser fetcher; integration tests use `@pytest.mark.browser` and run in the Docker CI job (`tests/test_crawl_fetchers.py`, `tests/test_crawler_browser_e2e.py`). Locally: `./local-test browser` (skips gracefully if Chromium is missing).

## Running tests

Match CI before opening a pull request:

```bash
./local-test              # full check — three Python 100% gates + web (recommended)
./local-test python       # backend: core, reporting, and tools coverage gates
./local-test browser      # JS crawl integration tests (skips if Chromium unavailable)
./local-test web          # frontend only
./local-test quick        # faster; DB must already be running
```

CI also runs a **Docker** job (image build, browser pytest in container, compose smoke) and a **dotnet** job (`dotnet test services/WebsiteProfiling.slnx` plus the Bff OpenAPI drift gate). `./local-test dotnet` runs the same .NET suite locally. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

When adding tools coverage tests, register new files in `scripts/local-test.sh`, `scripts/local-test.ps1`, and `.github/workflows/ci.yml` (see [AGENT.md](AGENT.md)).

**.NET DI validation:** Every API service (`AiService`, `Bff`, `Data`, `IntegrationsService`, `ReportService`) enables `ValidateOnBuild` / `ValidateScopes` in `Program.cs` and includes `ServiceRegistrationValidationTests` — a `WebApplicationFactory` smoke test that builds the real host graph. Add the same when introducing a new .NET API project.

## How to contribute

1. **Fork** the repository and create a branch from `master`.
2. **Make focused changes** — one logical fix or feature per pull request when possible.
3. **Follow existing patterns** — UI copy in `web/src/strings.json`; category names in `src/website_profiling/reporting/terminology.py`; see [docs/GLOSSARY.md](docs/GLOSSARY.md).
4. **Add or update tests** when changing behavior (Python: `tests/`; web: `web/src/**/*.test.ts`).
5. **Run `./local-test`** (or the relevant subset) and fix failures.
6. **Open a pull request** with a clear description, screenshots for UI changes, and steps to verify.

### Pull request checklist

- [ ] Tests pass locally (`./local-test` or documented subset)
- [ ] No secrets committed (`.env`, credentials, API keys)
- [ ] User-facing text uses industry terms from the glossary (not internal codenames like “pipeline” in the UI)
- [ ] Database changes include an EF Core migration (`dotnet ef migrations add <Name>`) in `services/Schema/src/Schema.Model/`

Authoring a migration needs the `dotnet-ef` CLI tool (design-time only — never a runtime dependency). It's pinned via a local tool manifest at `services/dotnet-tools.json`; run `dotnet tool restore` from `services/` once, then `dotnet tool run dotnet-ef migrations add <Name> --project services/Schema/src/Schema.Model/Schema.Model.csproj` with `DATABASE_URL` set.

## Link Explorer: Search & retention

Per-URL GSC/GA4 in Link Explorer uses two histories:

| Store | How it is created | Compare |
|-------|-------------------|---------|
| `google_data` | Site-wide **Fetch data now** (scoped to the `properties` row for the audit Site URL) | Pick an older site snapshot in the tab |
| `page_google_snapshots` | **Fetch live data** on the Search & retention tab | Defaults to previous live fetch for the same URL |

**Google OAuth:** App Client ID/Secret and optional service account JSON live in PostgreSQL (`google_app_settings`, migration `006_google_app_settings`). Each **property** (domain) has its own refresh token and GSC/GA4 IDs on the `properties` table. Set a Site URL, then connect Google from **Integrations**. Configure via the UI or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars for bootstrap only.

**Prerequisites:** Google connected with GSC site URL and GA4 property saved; at least one site-wide fetch for snapshot defaults; two or more live fetches on the same URL to compare live periods. AI page coach requires **Enable AI insights** and **Link Explorer page coach** under Run audit → **Content quality & AI insights**.

Apply migrations before using live fetch: `./local-run migrate` or `dotnet run --project services/Schema/src/Schema.Migrator`.

### PostgreSQL JSONB rows

The connection pool uses psycopg `dict_row`. When reading JSON/JSONB columns:

- Use **`_parse_row_json(row)`** (Python) or **`parseJsonField(row.data)`** (Node) — not `json.loads(row[0])` or `row[0]`.
- JSONB values may already be objects; stringifying them breaks parsing.
- For GSC blobs, prefer **`gsc_full` with fallback to `gsc`**.

## Code style

| Area | Guidance |
|------|----------|
| Python | Match surrounding modules; run `pytest` with project `pytest.ini` |
| TypeScript / React | `npm run typecheck` and `npm run lint` in `web/` |
| Copy / labels | Edit `web/src/strings.json`, not hardcoded strings in components |

## Reporting bugs and ideas

- **Bugs** — use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
- **Features** — use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Questions** — open a GitHub Discussion or issue with the “question” label if enabled.

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) as the project.
