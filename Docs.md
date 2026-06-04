# Crawl overview

**Config load order (CLI):** `--config` file → PostgreSQL `pipeline_config` → shadow `DATA_DIR/pipeline-config.txt` (see `src/website_profiling/cli.py`).

**What it does:** Starts from `start_url` in **audit settings** (PostgreSQL / Run audit in the web UI), fetches HTML with HTTP GET, parses `<a href>` with BeautifulSoup (static HTML only—no JS execution), normalizes links, filters (same-site, robots, depth, excludes), and queues until `max_pages` or the queue is empty.

**Main code:** `src/website_profiling/crawl/crawler.py`, `src/website_profiling/common.py`.

**Links → graph:** The report step builds directed edges from stored outlinks (see `src/website_profiling/reporting/builder.py`). Client-rendered-only links are not discovered unless they appear in the server HTML.

