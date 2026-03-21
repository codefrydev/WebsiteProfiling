# WebsiteProfiling

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

Crawl a site, build a link graph, and produce SEO-style reports (console + optional React UI over `report.db`).

## Setup

```bash
pip install -r requirements.txt
```

Optional ML: `pip install -r requirements-ml.txt`, then enable flags in `input.txt`. The **GitHub Pages** workflow installs both requirement files so CI builds include ML deps.

**spaCy / NER:** installs are tested on **Python 3.12** (what CI uses). If `pip install` fails while building **`blis`** on **Python 3.13**, recreate your virtualenv with 3.12 (`python3.12 -m venv venv`) and reinstall, or set `enable_ner_spacy = false` in `input.txt` until you use 3.12.

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

## Contribute

Fork and adapt as you like. Happy burning your website.

Thankyou ✌️
