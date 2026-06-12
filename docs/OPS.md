# Site Audit — operations

Cron-friendly HTTP endpoints for scheduled audits and property alerts. All routes require local access (same host) unless you proxy them behind your own auth.

## Scheduled audits

**Endpoint:** `POST /api/schedule/check`

Runs `schedule_runner.py`, which:

1. Matches each property’s `schedule_cron` (UTC, five-field cron) against the current minute.
2. Spawns a full audit (`python -m src`) with `WP_PROPERTY_ID` and `WP_SCHEDULED_SPAWN=1`.
3. The child process **reads** `pipeline_config` only for shared integration keys (Google, etc.). Crawl settings come from the property’s `site_url` and `default_crawl_preset` (starter / spa / ecommerce / performance). **`pipeline_config` is never written or overwritten** — not by cron, not in memory on top of saved workspace keys.

Manual **Run audit** from the web UI uses saved `pipeline_config` unchanged (no overlay, no env property id on the pipeline spawn).

**Example (every Monday 06:00 UTC):**

```bash
# crontab -e
0 6 * * 1 curl -fsS -X POST http://127.0.0.1:3000/api/schedule/check
```

Response includes `output` (runner log) and `gscLinksStale` (properties needing a GSC Links CSV re-import).

## Property alerts

**Endpoint:** `POST /api/alerts/check?propertyId={id}`

Checks health-score drops and stale GSC Links imports; POSTs to `alert_webhook_url` when configured on the property.

```bash
0 7 * * * curl -fsS -X POST "http://127.0.0.1:3000/api/alerts/check?propertyId=1"
```

Configure webhook, email, and cron per property under **Integrations → Scheduled audits & alerts**.

## Read-only client access

Set `AUTH_DEFAULT_ROLE=client-readonly` so session logins cannot run audits or save settings. The API returns 403 on mutations; the UI hides **Run audit** and disables save controls.

## Database migrations

After pulling roadmap changes, apply Alembic revision `011` (included in the full local/CI test run):

```bash
./local-test all
# or, if Postgres is already up: ./local-test quick
```

**Docker:** run migrations automatically at container start. Use `docker compose up` (build) or `docker compose -f docker-compose.pull.yml up` (pre-built `WEB_IMAGE`) so Postgres and the app share a network — not standalone `docker run`.

## Running tests

**Python (core, 100% coverage on non-omitted modules):**

```bash
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling
alembic upgrade head
pytest tests/ -m "not browser"
```

Integration tests (`@pytest.mark.integration`) skip when `DATABASE_URL` is unset. Browser crawl E2E:

```bash
pytest tests/test_crawler_browser_e2e.py -m browser
```

**Reporting and tools** (separate 100% coverage gates, same as CI):

```bash
pytest tests/test_categories_roadmap.py tests/test_report_categories_golden.py \
  tests/test_categories_coverage.py tests/test_indexation_coverage.py tests/test_crawl_segments.py \
  tests/test_terminology.py \
  --cov=website_profiling.reporting --cov-config=.coveragerc.reporting --cov-fail-under=100 -o addopts=

pytest tests/test_alert_checker.py tests/test_schedule_runner.py tests/test_export_audit.py \
  tests/test_export_audit_coverage.py \
  --cov=website_profiling.tools --cov-config=.coveragerc.tools --cov-fail-under=100 -o addopts=
```

**Web (Vitest route and lib tests):**

```bash
cd web && npm test
```
