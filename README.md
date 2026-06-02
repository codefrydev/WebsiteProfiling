# WebsiteProfiling

## Run with Docker

From the **repository root**:

```bash
docker compose up --build
```

Open **http://localhost:3000/home**. Use **`http://localhost:3000`**

Docker Compose starts **PostgreSQL** and the web app. Data persists in Docker volumes (`pg-data` for the database, `profiling-data` for secrets and shadow config).

## Run locally

**1. PostgreSQL**

```bash
docker run -d --name wp-pg \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=website_profiling \
  -p 5432:5432 postgres:16-alpine

export DATABASE_URL=postgres://postgres:dev@localhost:5432/website_profiling
export DATA_DIR=$(pwd)/data
mkdir -p "$DATA_DIR"
```

Apply schema:

```bash
pip install -r requirements.txt
alembic upgrade head
```

**2. Python** (repo root)

```bash
python -m venv .venv
```

Activate `.venv`, then:

```bash
pip install -r requirements.txt
```

Optional LLM enrichment: `pip install -r requirements-llm.txt` — configure in the web UI **AI** tab only.

**3. Configure & run the pipeline**

The easiest way is via the **web UI** (terminal icon, bottom-right corner at `http://localhost:3000`):
- Settings are stored in PostgreSQL (`pipeline_config` table).
- A shadow `pipeline-config.txt` is auto-written to `DATA_DIR` on every Save/Run.
- On first open, if the table is empty, the UI imports from shadow `pipeline-config.txt` (if present).
- **AI enrichment**: use the **AI** tab — settings live in `llm_config` in PostgreSQL only.

To run from the CLI:

```bash
export DATABASE_URL=postgres://postgres:dev@localhost:5432/website_profiling
python -m src
```

**4. Next.js UI** (`web/`)

```bash
cd web
npm install
export DATABASE_URL=postgres://postgres:dev@localhost:5432/website_profiling
export DATA_DIR=../data
npm run dev
```

Open **http://localhost:3000/home**.

If pipeline runs fail with `spawn python ENOENT`, macOS often has no `python` on PATH (only `python3`). The server auto-resolves `.venv/bin/python` or `python3`; you can also set `export PYTHON="$(pwd)/.venv/bin/python"` before `npm run dev`, or set **Python executable** under Pipeline → Advanced.

### PostgreSQL performance tuning

Optional environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MIN` | 2 | Python pipeline minimum pool connections |
| `DB_POOL_MAX` | 20 | Python pipeline maximum pool connections |
| `PGPOOL_MAX` | 20 | Next.js `pg` pool size |

Pipeline config (web UI or shadow file):

- **`crawl_stream_to_db`** — batch-write crawl rows during fetch (auto-enabled when `max_pages > 100`).
- **`lighthouse_concurrency`** — parallel Lighthouse URL audits (default 2).
- **`llm_concurrency`** (AI tab) — parallel LLM API batches (default 2).

Benchmark crawl writes: `python scripts/bench_crawl_write.py -n 1000` (requires `DATABASE_URL`).

### Backup

```bash
pg_dump -Fc "$DATABASE_URL" -f backup.dump
```

---

## Google Search Console + GA4 Integration

Pull real search and traffic data into your reports.

### Prerequisites

1. Create a [Google Cloud project](https://console.cloud.google.com/).
2. Enable two APIs: **Google Search Console API** and **Google Analytics Data API**.
3. Create an **OAuth 2.0 Client ID** (type: *Web application* or *Desktop app*).
4. Add `http://localhost:3000/api/integrations/google/callback` as an **Authorised redirect URI**.
5. Note your **Client ID** and **Client Secret**.

### In-app setup

1. Open **http://localhost:3000** (gear in the header on every page, or **Configure Google** on home).
2. Click the **gear icon (⚙)** → **Google Integrations**.
3. **Step 1:** Paste your Client ID and Client Secret → **Save**.
4. **Step 2:** Click **Connect with Google** → authorise in the browser → you're redirected back.
5. Pick your **Search Console site** and **GA4 property** from the dropdowns (or paste IDs manually).
6. Click **Test connection** to verify, then **Fetch data now** to pull the first snapshot.

### CLI usage

```bash
# Fetch GSC + GA4 data and store in PostgreSQL
python -m src google

# Validate credentials only (does not store data)
python -m src google --test

# List accessible properties (prints JSON)
python -m src google --list-properties
```

Running `python -m src report` will automatically carry forward the latest Google data snapshot into the new payload — no re-fetch needed.
