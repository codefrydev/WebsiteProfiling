# WebsiteProfiling

A **console application** for website crawling, link-graph building, and SEO-style site reports. It helps you profile site structure (status codes, content types, titles, outlinks, domains), collect SEO and performance-related data (meta descriptions, H1s, response time, content length, canonicals), and generate interactive HTML reports with executive summary, SEO health metrics, issues, and recommendations.

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

To leave the venv later, run `deactivate`.

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

Update Input text file with your desired data.

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

- **crawl_results.csv** or **crawl_results.json**
- **edges.csv** or **edges.json** 
- **site_report.html** — Interactive report: executive summary, crawl overview, SEO health, issues and recommendations, top pages, charts, and site graph. Print-friendly.
- **site_graph.svg** 


## Scope

For now This tool focuses on **site structure and SEO-style health** (status codes, content types, titles, meta descriptions, H1s, outlinks, domains, link graph, PageRank/degree, response time, content length), plus category-based checks (technical SEO, performance heuristics, accessibility, link health, mobile viewport, security headers and vulnerability findings). It includes **passive and optional active security scanning** (headers, injection risk, open redirect, CSRF/form checks). 

It does **not** measure Core Web Vitals (LCP, FID, CLS) or color contrast, which require a browser; use **Lighthouse** or **PageSpeed Insights** for Core Web Vitals, and **axe** or browser DevTools for contrast and full accessibility audits.

Please feel free to Contribute or Fork this repo, change the source code based on your needs. At the End this tool is developed made public to help me and others folks like you.

Thankyou ✌️