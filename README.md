# WebsiteProfiling

## Run with Docker

From the **repository root**:

```bash
docker compose up --build
```

Open **http://localhost:3000/home**. Use **`http://localhost:3000`**

## Run locally

**1. Python** (repo root)

```bash
python -m venv .venv
```

Activate `.venv`, then:

```bash
pip install -r requirements.txt
```

Optional ML: `pip install -r requirements-ml.txt`

**2. Configure & run the pipeline**

The easiest way is via the **web UI** (terminal icon, bottom-right corner at `http://localhost:3000`):
- Settings are stored in `report.db` (`pipeline_config` table) — the same database used for crawl data. Back up the whole pipeline by copying one file.
- A shadow `pipeline-config.txt` is auto-written next to `report.db` on every Save/Run (safe to delete; regenerated automatically).
- On first open, if the table is empty, the UI imports from shadow `pipeline-config.txt` (if present).
- Click **Save settings** to persist, or **Run pipeline** to save + run immediately.

To run from the CLI instead:

```bash
python -m src
```

Python reads settings from `report.db` (`pipeline_config` table) by default — use the web UI to configure, or set `REPORT_DB_PATH` to point at your database (Docker sets this automatically). If the table is empty, the CLI falls back to shadow `pipeline-config.txt` next to `report.db`. Override with `--config path` for a custom key=value file. Steps: `crawl`, `report`, `plot`, `lighthouse`, `keywords`, `warnings`, `enrich` as extra args.

> **Reference:** `input.txt.example` shows all config keys in the legacy file format (optional; not loaded automatically).

**3. Next.js UI** (`web/`)

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3000/home**.

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
# Fetch GSC + GA4 data and store in report.db (uses pipeline_config in report.db)
python -m src google

# Validate credentials only (does not store data)
python -m src google --test

# List accessible properties (prints JSON)
python -m src google --list-properties
```

Running `python -m src report` will automatically carry forward the latest Google data snapshot into the new payload — no re-fetch needed.
