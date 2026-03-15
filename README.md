# WebsiteProfiling

A **console application** for website crawling, link-graph building, and SEO-style site reports. It helps you profile site structure (status codes, content types, titles, outlinks, domains), collect SEO and performance-related data (meta descriptions, H1s, response time, content length, canonicals), and generate interactive HTML reports with executive summary, SEO health metrics, issues, and recommendations.

## Project structure

- **src/** — Application code
  - **crawler.py** — Site crawler (threaded, robots.txt, optional outlink storage).
  - **report.py** — HTML report generation (loads data, builds edges, renders from templates).
  - **plot.py** — Link graph construction and matplotlib figure export.
  - **common.py** — Shared helpers (URL normalization, link parsing, robots).
  - **config.py** — Input file parser (key=value).
  - **templates.py** — Template loader; injects data via JSON for proper sanitization.
  - **cli.py** — CLI entry (crawl / report / plot from config).
- **templates/** — HTML report templates (placeholders `{{ generated_time }}`, `{{ report_data }}`); data is JSON-encoded for safe injection.
- **input.txt.example** — Example config; copy to `input.txt` and edit.

## What it does

- **Crawl** a site from a start URL (respects robots.txt, configurable depth and concurrency).
- **Report** — generate interactive HTML with executive summary, crawl overview, SEO health (titles, meta descriptions, H1s, thin content), issues and recommendations, top pages by importance, plus Chart.js and vis-network (status, content types, title lengths, outlinks, domains, site graph). Reports are print-friendly.
- **Plot** — build a link graph and draw it with matplotlib (edges.csv, nodes.csv, optional image file).

All inputs are read from **one config file**. Edit the file, run the app, and it picks up the settings and runs.

## Install

### Virtual environment (recommended)

Create and activate a venv so dependencies stay isolated:

```bash
# Create a virtual environment in the project directory
python3 -m venv venv

# Activate it (Unix/macOS)
source venv/bin/activate

# Activate it (Windows, Command Prompt)
venv\Scripts\activate.bat

# Activate it (Windows, PowerShell)
venv\Scripts\Activate.ps1
```

Then install dependencies (see below). To leave the venv later, run `deactivate`.

### Install dependencies

With the venv activated (or using your system Python):

```bash
pip install -r requirements.txt
```

Or install the package in development mode (if using pyproject.toml):

```bash
pip install -e .
```

## Input file

Copy the example and edit it:

```bash
cp input.txt.example input.txt
# Edit input.txt with your URL and options
```

For the weekly GitHub Actions report (see `.github/workflows/weekly-report.yml`), commit `input.txt` so the workflow can run.

### Input file format

Use a simple `key = value` (or `key: value`) format. Blank lines and lines starting with `#` are ignored.

| Key | Description | Example |
|-----|-------------|---------|
| **Crawl** | | |
| start_url | URL to start crawling | https://codefrydev.in |
| max_pages | Max pages to crawl (empty = no limit) | 1000 |
| concurrency | Number of concurrent requests | 8 |
| timeout | Request timeout (seconds) | 12 |
| ignore_robots | If true, ignore robots.txt | false |
| allow_external | If true, follow links to other domains | false |
| max_depth | Max depth from start URL (empty = no limit) | 6 |
| polite_delay | Delay between requests in seconds | 0.2 |
| crawl_output | Path for crawl CSV | crawl_results.csv |
| store_outlinks | If true, store outlink URLs in crawl CSV (for reports) | true |
| **Report** | | |
| crawl_csv | Path to crawl CSV | crawl_results.csv |
| edges_csv | Path to edges CSV (built if missing) | edges.csv |
| nodes_csv | Path to nodes CSV (used by plot) | nodes.csv |
| report_output | Path for HTML report | site_report.html |
| site_name | Optional site name for report title and summary (default: domain of start_url) | My Website |
| report_title | Optional custom report title (default: site_name + report type) | SEO Report |
| max_fetch_for_edges | Max URLs to fetch when building edges if not in CSV | 300 |
| same_domain_only | Keep only same-domain edges in report/plot | true |
| max_nodes_plot | Max nodes in report graph | 400 |
| **Plot** | | |
| plot_image_output | Path to save graph image (optional) | site_graph.svg |
| plot_crawl_csv | Path to crawl CSV for plot (uses crawl_csv if not set) | — |
| plot_edges_csv | Path to edges CSV (uses edges_csv if not set) | — |
| plot_nodes_csv | Path to nodes CSV (uses nodes_csv if not set) | — |
| **Run** | | |
| run_crawl | Run crawl step | true |
| run_report | Run report step | true |
| run_plot | Run plot step | false |

## How to run

**Run all steps** (crawl, then report, then optionally plot) using the default config file `input.txt`:

```bash
python -m src
```

Or specify the config file:

```bash
python -m src --config myconfig.txt
```

**Run a single step** (still reads settings from the config file):

```bash
python -m src crawl
python -m src report
python -m src plot
```

## Outputs

- **crawl_results.csv** — Per-URL: url, status, content_type, title, outlinks (and optionally outlink_targets if store_outlinks is true); response_time_ms, content_length, final_url, meta_description, meta_description_len, h1, h1_count, canonical_url (SEO/performance fields from crawler).
- **edges.csv** — Link graph edges (from, to).
- **nodes.csv** — Node list (from report/plot).
- **site_report.html** — Interactive report: executive summary, crawl overview, SEO health, issues and recommendations, top pages, charts, and site graph. Print-friendly.
- **site_graph.svg** — Matplotlib graph (if plot_image_output is set).

## Report sections

- **Executive summary** — Site name, crawl date, key KPIs (total URLs, success rate, 4xx/5xx/redirect counts), and top recommendations.
- **Crawl overview** — Total pages, average outlinks, average title length, crawl duration.
- **SEO health** — Counts for missing/OK/short/long titles and meta descriptions, single/multiple H1s, thin content (when crawl data includes the SEO columns).
- **Issues and recommendations** — Broken URLs (4xx/5xx), redirects (3xx), SEO issues (missing/short/long title or meta desc, H1 issues, thin content), plus actionable recommendation bullets.
- **Top pages** — Pages ranked by link importance (PageRank/degree) for quick reference.

To save the report as PDF, open the HTML report in a browser and use **Print → Save as PDF**.

## Scope

This tool focuses on **site structure and SEO-style health** (status codes, content types, titles, meta descriptions, H1s, outlinks, domains, link graph, PageRank/degree, response time, content length). It does not measure Core Web Vitals or run in-browser performance; for that, use Lighthouse or similar tools.
