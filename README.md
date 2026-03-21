# WebsiteProfiling

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

Crawl a site, build a link graph, and produce SEO-style reports (console + optional React UI over `report.db`).

## Setup

```bash
pip install -r requirements.txt
```

Optional ML: `pip install -r requirements-ml.txt`, then enable flags in `input.txt`. The **GitHub Pages** workflow installs both requirement files so CI builds include ML deps.

**spaCy / NER:** installs are tested on **Python 3.12** (what CI uses). If `pip install` fails while building **`blis`** on **Python 3.13**, recreate your virtualenv with 3.12 (`python3.12 -m venv venv`) and reinstall, or set `enable_ner_spacy = false` in `input.txt` until you use 3.12.

### ML / crawl text options

- **`store_content_excerpt` / `content_excerpt_max_chars`:** optional truncated plain text from each page body (crawl + report payload). Improves Python fingerprints and browser-side Transformers.js (`@xenova/transformers`). Larger SQLite rows and JSON.
- **Semantic duplicate refinement:** `enable_embedding_duplicate_refine` requires a fuzzy duplicate candidate pair to also pass sentence-transformer cosine similarity (`ml_dup_embed_min_pct`).
- **KeyBERT:** `enable_keybert` adds salient keyphrases per URL (uses the same `ml_sentence_model` as semantic similarity).
- **`ml_verbose`:** tqdm-style progress during long `sentence_transformers` encode batches.

### Browser (React UI) Transformers.js

The UI loads **Transformers.js** models on demand (cached in the browser). **Overview**, **Content Insights**, **Site audit**, **Link Explorer**, **On-page SEO**, **Page Speed** (Lighthouse), **Security**, and **Crawl analytics** include the same **Browser ML** block (zero-shot + sentiment, with download progress); **Link Explorer → Page analysis** adds embedding similarity with a **download progress** bar. Default embedding model: `Xenova/all-MiniLM-L6-v2` (aligned with `all-MiniLM-L6-v2` in Python). Zero-shot uses `Xenova/distilbert-base-uncased-mnli`; sentiment uses `Xenova/distilbert-base-uncased-finetuned-sst-2-english`.

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
