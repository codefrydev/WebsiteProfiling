# WebsiteProfiling

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

## Which branch to use

- **`Docker` branch — use this for the full server stack.** That line is the **Docker-based, server-oriented** project: containerized run, API/job flow, and the Next.js-style web app wired for server use. Clone or checkout **`Docker`** when you want to run the pipeline and browse reports through the hosted-style setup (see `Dockerfile`, `docker-compose.yml`, and `web/` on that branch).

  **Clone the Docker branch and run with Compose** (from a directory where you want the repo):

  ```bash
  git clone -b Docker --single-branch https://github.com/codefrydev/WebsiteProfiling.git
  cd WebsiteProfiling
  docker compose up --build
  ```

  Run these from the **repository root** on the `Docker` branch (where `docker-compose.yml` lives). The first build can take a while; when the stack is healthy, use the URL or port printed in the compose logs (or any `web/README.md` on that branch) to open the app in your browser.

- **`master` branch — statics only.** This branch is aimed at **static / offline** use: crawl locally, produce `report.db`, and optionally open the static React UI against that database. No Docker server story is the default here; it is the lightweight, file-based workflow.

If you are unsure, prefer **`Docker`** for anything “run it like a service” and **`master`** for “run Python locally and open static assets.”

---

Crawl a site, build a link graph, and produce SEO-style reports (console + optional React UI over `report.db`).

## Setup

```bash
pip install -r requirements.txt
```

Optional ML: `pip install -r requirements-ml.txt`, then enable flags in `input.txt`.

### ML / crawl text options

### Browser (React UI) Transformers.js

The UI loads **Transformers.js** models on demand (cached in the browser). A **floating browser assistant** (bottom-right) runs

## Run

Edit **`input.txt`**, then from the **repository root**:

```bash
python -m src
```

Another config file:

```bash
python -m src --config myconfig.txt
```

Single steps: `python -m src crawl` | `report` | `plot` | `lighthouse` | `keywords` | `warnings` | `enrich`.

## What this tool is (and is not)

**This is a crawl-first, offline report:** one site, one SQLite `report.db`, static React UI. The pipeline derives SEO signals from **your** pages (HTML, links, optional ML).

**Included without external APIs:** internal link graph, on-page technical SEO, Lighthouse (when run), optional duplicate detection / language / NER / semantic keyword clusters, **outbound domains** you link to, **hreflang / `<html lang>`** from HTML, **keyword topic clusters** and **opportunity heuristics** from on-site text, **URL fingerprints** for **compare-two-report** diffs in the UI.

**Not included (needs third-party data):** backlinks and referring domains, “who links to you” authors, brand mentions across the web, keyword **search volume / difficulty / rank** by country, or competitor benchmarks like enterprise SEO suites. Those require Search Console, Ads, or paid SEO APIs and a backlink index — not this repo’s default scope.

**Compare two crawls:** each `report` step appends a row to `report_payload`. Run the pipeline twice (or re-run report after a new crawl) so the UI header can pick a **Compare** baseline; fingerprints detect new/removed/changed URLs.

## Contribute

Fork and adapt as you like. Happy burning your website.

Thankyou ✌️
