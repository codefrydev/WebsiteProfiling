# WebsiteProfiling — Internal SEO Platform

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

A comprehensive **internal SEO & marketing intelligence platform** — an all-in-one tool combining capabilities similar to Ahrefs, Semrush, and analytics platforms. Built for single-user local use with no authentication or client management overhead.

## Features

| Module | Capabilities |
|--------|-------------|
| **Site Audit** | Multi-threaded crawler, 200+ SEO checks, HTTP auth, crawl comparison, log file analysis, sitemap generation |
| **Site Explorer** | Domain overview, backlink profile, referring domains, organic/paid keywords, content gap, link intersect |
| **Keywords Explorer** | Keyword research, volumes, difficulty, intent classification, clustering, SERP analysis, AI suggestions |
| **Rank Tracker** | Daily position tracking, visibility scores, SERP history, cannibalization detection, alerts |
| **GSC Insights** | Google Search Console integration, query/page analytics, low-hanging fruit, content decay |
| **Competitive Intel** | Traffic estimation, keyword gap, backlink gap, batch analysis, market segments |
| **Content Tools** | Content explorer, AI content helper, content grader, topic research, inventory & decay detection |
| **Brand Radar** | Web mention monitoring, AI visibility tracking (ChatGPT/Claude/Gemini), share of voice |
| **Web Analytics** | Privacy-first analytics, AI traffic tracking, bot analytics, funnels, real-time |
| **Social Media** | Multi-platform scheduling, calendar, analytics, social listening, influencer research |
| **Advertising** | PPC keyword research, competitor ad intelligence, AI ad copy generation |
| **Local SEO** | GBP management, local rank tracking, geo-grid heatmaps, review management, citation management |
| **Reporting** | Portfolio management, drag-and-drop report builder, PDF/Excel/CSV export, scheduled reports |
| **Alerts** | Rank change, backlink, brand mention, site audit alerts via email/Slack |
| **AI Assistant** | Chat-based SEO advisor, robots.txt generator, schema markup, redirect suggestions |

## Architecture

```
WebsiteProfiling/
├── backend/          # FastAPI + PostgreSQL (new features)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/   # All API routes (no auth required)
│   │   ├── db/       # SQLAlchemy models + session
│   │   ├── schemas/  # Pydantic schemas
│   │   └── services/ # DataForSEO, AI, scheduler
│   ├── alembic/      # DB migrations
│   └── requirements.txt
├── src/              # Python CLI modules
│   ├── cli.py        # CLI entry point
│   ├── crawler.py    # Website crawler
│   ├── rank_tracker.py
│   ├── keywords_explorer.py
│   ├── site_explorer.py
│   ├── gsc_integration.py
│   ├── web_analytics.py
│   ├── content_tools.py
│   ├── brand_radar.py
│   ├── competitive_intel.py
│   ├── social_media.py
│   ├── advertising.py
│   ├── local_seo.py
│   ├── report_builder.py
│   ├── alerts.py
│   ├── ai_tools.py
│   └── db.py         # SQLite schema (crawl data cache)
├── UI/               # React SPA
│   └── src/
│       ├── App.jsx   # Main app with all 26 views
│       ├── views/    # All feature views
│       └── lib/api.js # FastAPI client
├── tracking/
│   └── analytics.js  # Lightweight browser tracking script
├── docker-compose.yml
└── .env.example
```

## Quick Start

### Option A: Docker (Recommended)

```bash
# Copy and edit environment config
cp .env.example .env

# Start everything (PostgreSQL + backend + frontend)
docker compose up -d
# (or: docker-compose up -d)

# Open the app
open http://localhost:5173
```

**Smoke test (build + health + OpenAPI check)** — from the repo root:

```bash
./scripts/docker-test.sh
```

Requires Docker with Compose (`docker compose` or `docker-compose`). API docs after a successful run: [http://localhost:8000/docs](http://localhost:8000/docs).

### Backend API tests

CI runs a SQLite-backed smoke suite over `/api/v1` routes. Locally:

```bash
make backend-test
# or: cd backend && pytest tests/test_v1_surface.py -q
```

### OpenAPI route checklist

Regenerate a markdown list of every documented path (from the FastAPI app):

```bash
cd backend && PYTHONPATH=. python3 scripts/openapi_inventory.py
# writes backend/openapi_routes.md
```

The React client in `UI/src/lib/api.js` is kept in sync with these routes; most views require a **selected project** from the header (API calls use `project_id`).

### Option B: Manual Setup

**1. Start PostgreSQL**
```bash
# Using Docker for just the database
docker run -d --name pg -e POSTGRES_PASSWORD=websiteprofiling -p 5432:5432 postgres:16-alpine
```

**2. Start the Backend API**
```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # edit .env with your settings
alembic upgrade head          # run migrations
uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

**3. Start the Frontend**
```bash
cd UI
npm install
npm run dev
# Open: http://localhost:5173
```

**4. Run CLI Tools**
```bash
# In project root with venv activated
pip install -r requirements.txt

# Website crawl (existing functionality)
python -m src crawl
python -m src report

# New tools
python -m src rank-tracker add --keywords "python seo tool" --location "United States"
python -m src rank-tracker check
python -m src keywords-explorer research --seed "seo tools"
python -m src site-explorer overview --domain example.com
python -m src brand-radar scan-ai --brand "YourBrand"
python -m src alerts check
```

## Configuration

Edit `.env` to configure API integrations (all optional — tool works with graceful fallbacks):

| Service | Purpose |
|---------|---------|
| `DATAFORSEO_LOGIN/PASSWORD` | Keyword volumes, SERP data, backlink data |
| `OPENAI_API_KEY` | AI content generation, SEO assistant |
| `ANTHROPIC_API_KEY` | AI assistant, Claude brand scanning |
| `GOOGLE_CLIENT_ID/SECRET` | GSC, GA4, Google Business Profile |
| `SLACK_WEBHOOK_URL` | Alert notifications |
| `SMTP_*` | Email alerts and scheduled reports |

Configure in the UI: **Settings → API Keys**

## Website Tracking

Embed on your website for privacy-first analytics:

```html
<script src="http://your-server:8000/tracking.js" data-site="your-site-id" async></script>
```

Custom events:
```javascript
window.wpAnalytics.track('conversion', { value: 99 });
```

## CLI Reference

```bash
python -m src [command] [subcommand] [options]

Commands:
  crawl               Run website crawler
  report              Generate site report
  plot                Generate link graph
  lighthouse          Run Lighthouse audits
  rank-tracker        Track keyword rankings
  keywords-explorer   Keyword research tools
  site-explorer       Domain analysis
  gsc                 Google Search Console
  analytics           Web analytics
  content             Content marketing tools
  brand-radar         Brand monitoring
  competitive         Competitive intelligence
  social              Social media management
  advertising         PPC & ad intelligence
  local-seo           Local SEO & GBP
  report-builder      Report generation
  alerts              Alert management
  ai                  AI SEO tools
  sitemap             Sitemap generation
  log-analyzer        Server log analysis
```

---

Feel free to contribute or fork this repo ✌️
