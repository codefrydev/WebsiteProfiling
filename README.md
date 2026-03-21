# WebsiteProfiling

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

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

Edit `**input.txt`**, then from the **repository root**:

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