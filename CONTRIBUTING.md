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

Details: [README.md](README.md), [AGENT.md](AGENT.md).

## Running tests

Match CI before opening a pull request:

```bash
./local-test              # full check (recommended)
./local-test python       # backend only
./local-test web            # frontend only
./local-test quick          # faster; DB must already be running
```

CI runs Python tests (PostgreSQL + Alembic), web typecheck/lint/vitest, CLI smoke, and a Docker build (see [.github/workflows/ci.yml](.github/workflows/ci.yml)).

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
- [ ] Database changes include an Alembic migration in `alembic/versions/`

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
