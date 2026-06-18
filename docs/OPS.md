# Operations Guide

This guide covers production operations for Site Audit: scheduled audits, property alerts, access control, database migrations, and test execution.

**Related documentation:** [README.md](../README.md) · [Documentation index](README.md)

---

## Overview

Site Audit exposes HTTP endpoints suitable for cron and monitoring systems. By default, these routes accept requests from localhost only. When exposing the application beyond a single host, place the endpoints behind your own authentication and network controls.

| Capability | Endpoint | Typical schedule |
|------------|----------|------------------|
| Scheduled audits | `POST /api/schedule/check` | Weekly or daily |
| Property alerts | `POST /api/alerts/check?propertyId={id}` | Daily |

Configure per-property schedules and webhooks under **Integrations → Scheduled audits & alerts**.

---

## Scheduled audits

### Endpoint

```
POST /api/schedule/check
```

### Behavior

The endpoint invokes `schedule_runner.py`, which:

1. Evaluates each property's `schedule_cron` expression (UTC, five-field cron syntax) against the current minute.
2. Spawns a full audit (`python -m src`) with `WP_PROPERTY_ID` and `WP_SCHEDULED_SPAWN=1`.
3. Reads `pipeline_config` for shared integration keys (Google, and similar) only. Crawl settings are derived from the property's `site_url` and `default_crawl_preset` (`starter`, `spa`, `ecommerce`, or `performance`).

**Important:** Scheduled runs never write to or overwrite `pipeline_config`. Manual **Run audit** actions from the web UI also use saved `pipeline_config` without modification.

### Example

Run scheduled audits every Monday at 06:00 UTC:

```bash
# crontab -e
0 6 * * 1 curl -fsS -X POST http://127.0.0.1:3000/api/schedule/check
```

### Response

The response includes:

- `output` — runner log
- `gscLinksStale` — properties that require a Google Search Console Links CSV re-import

---

## Property alerts

### Endpoint

```
POST /api/alerts/check?propertyId={id}
```

### Behavior

Evaluates health-score changes and stale GSC Links imports for the specified property. When `alert_webhook_url` is configured on the property, sends a POST notification to that URL. When `alert_email` is set and SMTP is configured on the server, sends a plain-text email summary.

Response JSON includes `alerts`, `webhook_sent`, and `email_sent`.

### SMTP (optional, for alert email)

Set on the host running the web app (Docker: web service environment):

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SMTP_HOST` | Yes (with `SMTP_FROM`) | — | SMTP server hostname |
| `SMTP_FROM` | Yes (with `SMTP_HOST`) | — | From address |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | Login user (if auth required) |
| `SMTP_PASS` | No | — | Login password |
| `SMTP_USE_TLS` | No | `true` | Use STARTTLS |

If SMTP is not configured, alert checks still succeed; `email_sent` is `false`.

### Example

Check alerts daily at 07:00 UTC for property ID 1:

```bash
# crontab -e
0 7 * * * curl -fsS -X POST "http://127.0.0.1:3000/api/alerts/check?propertyId=1"
```

---

## Access control

### Session roles

When `AUTH_SECRET` (or `SESSION_SECRET`) is set, the application requires login. Roles (`web/src/server/auth.ts`):

| Role | Mutations | AI Chat |
|------|-----------|---------|
| `analyst` (default) | Allowed | Allowed |
| `editor` | Allowed | Allowed |
| `admin` | Allowed | Allowed |
| `client-readonly` | Blocked (403) | Allowed |
| `viewer` | Blocked (403) | Blocked (403) |

Set the default role for new sessions:

```
AUTH_DEFAULT_ROLE=client-readonly
```

Production also requires `AUTH_SECRET` and optionally `AUTH_USER` / `AUTH_PASSWORD` (see `docker-compose.prod.yml`).

### Remote MCP (Streamable HTTP)

The `mcp` service in `docker-compose.prod.yml` exposes read-only audit tools over HTTP at `/mcp`. Configure on **Secrets → Remote MCP** (`/secrets`) or via environment variables (env overrides saved values):

| Variable | Purpose |
|----------|---------|
| `WP_MCP_TOKEN` | Bearer token for MCP clients (`Authorization: Bearer …`) |
| `WP_MCP_ALLOWED_HOSTS` | Public hostname allowlist (e.g. `audit.example.com`) |
| `WP_MCP_ALLOWED_ORIGINS` | Optional `Origin` allowlist |
| `WP_MCP_DOMAIN` | Tool bundle (`core` recommended for remote) |
| `MCP_PORT` | Host port mapped to container `8000` (default `8000`) |

Terminate TLS at your reverse proxy; do not expose plain HTTP publicly. Configure token and allowed hostnames on **Secrets → Remote MCP** (`/secrets`, Remote MCP section).

### Read-only client dashboards

Set `AUTH_DEFAULT_ROLE=client-readonly` so session logins cannot run audits or save settings. The API returns 403 on mutations; the UI hides **Run audit** and disables save controls. Use `viewer` instead if chat access should also be blocked.

---

## Read-only SQL chat tool

The chat agent includes an opt-in `run_sql_query` tool that lets the LLM generate and execute read-only SELECT queries against the audit database. Three layers of defense enforce the read-only constraint:

| Layer | Mechanism | What it blocks |
|-------|-----------|----------------|
| 1 — App parse | `sqlglot` AST check before any DB call | DELETE/UPDATE/INSERT/DDL, multi-statement, denied tables, dangerous functions |
| 2 — Engine | `BEGIN TRANSACTION READ ONLY` + `statement_timeout` | Any write that bypasses Layer 1; runaway queries |
| 3 — Privilege | Dedicated read-only DB role (optional) | Writes at the grant level, regardless of Layers 1–2 |

### Enabling the feature

Set the environment variable before starting the application:

```bash
CHAT_SQL_TOOL_ENABLED=true
```

The feature is **off by default**. When off, `run_sql_query` and `get_sql_schema` are never exposed to the LLM.

### Recommended: dedicated read-only role (Layer 3)

Create a least-privilege Postgres role and provide its connection string:

```sql
CREATE ROLE audit_readonly LOGIN PASSWORD 'choose-a-strong-password';
GRANT CONNECT ON DATABASE website_profiling TO audit_readonly;
GRANT USAGE ON SCHEMA public TO audit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO audit_readonly;
-- Revoke access to secret tables
REVOKE SELECT ON llm_config FROM audit_readonly;
REVOKE SELECT ON google_app_settings FROM audit_readonly;
REVOKE SELECT ON pipeline_config FROM audit_readonly;
REVOKE SELECT ON chat_sessions FROM audit_readonly;
REVOKE SELECT ON chat_messages FROM audit_readonly;
REVOKE SELECT ON content_drafts FROM audit_readonly;
-- Lock the role to read-only at the session level
ALTER ROLE audit_readonly SET default_transaction_read_only = on;
```

Then set:

```bash
DATABASE_URL_READONLY=postgres://audit_readonly:choose-a-strong-password@localhost:5432/website_profiling
```

When `DATABASE_URL_READONLY` is unset, the main `DATABASE_URL` pool is used, but the `BEGIN TRANSACTION READ ONLY` (Layer 2) still applies.

### Tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHAT_SQL_TOOL_ENABLED` | `false` | Enable the SQL chat tool |
| `DATABASE_URL_READONLY` | _(unset — falls back to `DATABASE_URL`)_ | Connection string for the read-only role |
| `SQL_STATEMENT_TIMEOUT_MS` | `5000` | Per-query statement timeout in milliseconds |
| `DB_RO_POOL_MAX` | `5` | Max connections in the read-only pool |

---

## Database migrations

Apply schema changes after pulling updates. Current Alembic head: **`015_crawl_page_html`** (per-URL HTML storage). Recent migrations: `013` (link edges, discovery mode), `014` (pipeline job log truncation).

```bash
./local-run migrate
```

If PostgreSQL is already running:

```bash
alembic upgrade head
```

### Docker deployments

Migrations run automatically at container start. Use one of the following so Postgres and the application share a network:

```bash
docker compose up              # build from source
docker compose -f docker-compose.pull.yml up   # pre-built WEB_IMAGE
```

Do not run the application container in isolation with `docker run` unless you provide a reachable `DATABASE_URL`.

---

## Running tests

For CI parity, run from the repository root:

```bash
./local-test              # Python + web (matches CI python and web jobs)
./local-test python       # Backend gates + browser pytest + CLI smoke
```

CI also runs a **Docker** job (image build, browser pytest in container, compose smoke). See [.github/workflows/ci.yml](../.github/workflows/ci.yml).

### Individual test targets

**Python (core coverage gate — 100%):**

```bash
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling
alembic upgrade head
pytest tests/ -m "not browser"
```

Integration tests marked `@pytest.mark.integration` skip when `DATABASE_URL` is unset.

**Browser crawl end-to-end:**

```bash
pytest tests/test_crawler_browser_e2e.py -m browser
```

**Reporting and tools coverage gates:**

```bash
./local-test python
```

Test file lists for reporting and tools gates are maintained in [scripts/local-test.sh](../scripts/local-test.sh) and [.github/workflows/ci.yml](../.github/workflows/ci.yml). Update all three locations when adding coverage tests.

**Web (Vitest):**

```bash
cd web && npm test
```
