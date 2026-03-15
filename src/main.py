import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urldefrag, urlparse
import urllib.robotparser as robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time
import pandas as pd
from tqdm.notebook import tqdm
from queue import Queue
# Full working Jupyter-ready website crawler (single cell).
# - Auto-installs missing packages (requests, beautifulsoup4, lxml, pandas, tqdm)
# - Threaded crawler, respects robots.txt by default
# - Robust progress bar fallback (won't raise IProgress errors)
# - Returns a pandas.DataFrame and saves CSV if requested
#
# Usage: set start_url and options below, then run the cell.

import sys
import subprocess
import importlib
from typing import Optional

# ---------- Auto-install helper ----------
def ensure_pkgs(pkgs):
    for pkg in pkgs:
        try:
            importlib.import_module(pkg)
        except Exception:
            print(f"Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
    # re-import to make sure available
    globals().update({p: importlib.import_module(p) for p in pkgs if p in sys.modules})

required = ["requests", "bs4", "lxml", "pandas", "tqdm"]
# module names vs package names: bs4 is package 'beautifulsoup4' but import module 'bs4'
# ensure_pkgs will pip-install by module name where possible; if pip name differs handle:
try:
    import bs4  # noqa
except Exception:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "beautifulsoup4"])
try:
    import requests, bs4, lxml, pandas, tqdm  # noqa
except Exception:
    ensure_pkgs(["requests", "bs4", "lxml", "pandas", "tqdm"])

# Now imports
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urldefrag, urlparse
import urllib.robotparser as robotparser
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
import threading
import time
import pandas as pd

# Use tqdm.auto which chooses best available progress (widget or console)
from tqdm.auto import tqdm

# ---------- Config ----------
DEFAULT_USER_AGENT = "PrashantNotebookCrawler/1.0"

# ---------- Helper functions ----------
def normalize_link(base, href):
    if not href:
        return None
    href = href.strip()
    if href.startswith(("mailto:", "javascript:", "tel:", "data:")):
        return None
    joined = urljoin(base, href)
    joined, _ = urldefrag(joined)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http", "https"):
        return None
    return joined

def parse_links(base_url, html_text):
    soup = BeautifulSoup(html_text, "lxml")
    title_tag = soup.title.string.strip() if soup.title and soup.title.string else ""
    links = set()
    # anchor links
    for a in soup.find_all("a", href=True):
        ln = normalize_link(base_url, a["href"])
        if ln:
            links.add(ln)
    # optional: collect assets (img/script/link) - commented out, enable if needed
    # for img in soup.find_all("img", src=True):
    #     ln = normalize_link(base_url, img["src"]); ...
    return title_tag, links

def load_robots(start_url):
    parsed = urlparse(start_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp
    except Exception:
        return None

# ---------- Crawler class ----------
class NotebookCrawler:
    def __init__(
        self,
        start_url: str,
        max_pages: Optional[int] = None,
        concurrency: int = 6,
        timeout: int = 12,
        ignore_robots: bool = False,
        allow_external: bool = False,
        max_depth: Optional[int] = None,
        user_agent: Optional[str] = None,
        polite_delay: float = 0.0,  # seconds between requests (per thread)
    ):
        self.start_url = start_url.rstrip("/")
        self.start_netloc = urlparse(self.start_url).netloc
        self.max_pages = max_pages if (max_pages is not None and max_pages > 0) else float("inf")
        self.concurrency = max(1, int(concurrency))
        self.timeout = timeout
        self.ignore_robots = ignore_robots
        self.allow_external = allow_external
        self.max_depth = None if max_depth is None else int(max_depth)
        self.user_agent = user_agent or DEFAULT_USER_AGENT
        self.polite_delay = max(0.0, float(polite_delay))

        # runtime structures
        self.queue = Queue()
        self.queue.put(self.start_url)
        self.depths = {self.start_url: 0}
        self.visited = set()
        self.results = []
        self.lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self.user_agent})
        self.rp = None if self.ignore_robots else load_robots(self.start_url)

    def same_domain(self, url):
        return urlparse(url).netloc == self.start_netloc

    def allowed_by_robots(self, url):
        if self.ignore_robots or not self.rp:
            return True
        try:
            return self.rp.can_fetch(self.user_agent, url)
        except Exception:
            return True

    def fetch(self, url):
        try:
            resp = self.session.get(url, timeout=self.timeout, allow_redirects=True)
            ct = resp.headers.get("Content-Type", "")
            text = resp.text if resp.status_code == 200 and ("text/html" in ct or "application/xhtml+xml" in ct) else None
            return resp.status_code, ct, text
        except Exception:
            return None, None, None

    def worker(self, url):
        # robots check
        if not self.allowed_by_robots(url):
            return {"url": url, "status": "blocked_by_robots", "content_type": "", "title": "", "outlinks": 0}

        status, ct, text = self.fetch(url)
        if status is None:
            return {"url": url, "status": "error", "content_type": "", "title": "", "outlinks": 0}

        title = ""
        outlinks_count = 0
        if text:
            title, links = parse_links(url, text)
            outlinks_count = len(links)
            for link in links:
                # domain constraint
                if not self.allow_external and not self.same_domain(link):
                    continue
                # depth check
                cur_depth = self.depths.get(url, 0)
                if self.max_depth is not None and cur_depth >= self.max_depth:
                    continue
                with self.lock:
                    if link not in self.visited and link not in self.depths and not self._queue_contains(link):
                        self.queue.put(link)
                        self.depths[link] = cur_depth + 1

        # polite delay after processing
        if self.polite_delay:
            time.sleep(self.polite_delay)

        return {"url": url, "status": status, "content_type": ct or "", "title": title, "outlinks": outlinks_count}

    def _queue_contains(self, item):
        # Queue doesn't provide direct membership; inspect internal queue object safely
        try:
            return item in list(self.queue.queue)
        except Exception:
            return False

    def crawl(self, show_progress: bool = True):
        start_time = time.time()
        futures = []
        pbar = tqdm(total=None if self.max_pages == float("inf") else int(self.max_pages),
                    desc="Pages", disable=not show_progress)
        with ThreadPoolExecutor(max_workers=self.concurrency) as ex:
            # loop until results reached or queue empty and no running workers
            while (len(self.results) < self.max_pages) and (not self.queue.empty() or futures):
                # submit tasks if slots available
                while not self.queue.empty() and len(futures) < self.concurrency and len(self.results) + len(futures) < self.max_pages:
                    url = self.queue.get()
                    # avoid duplicates
                    with self.lock:
                        if url in self.visited:
                            continue
                        self.visited.add(url)
                    futures.append(ex.submit(self.worker, url))

                # collect completed
                remaining = []
                for f in futures:
                    if f.done():
                        try:
                            res = f.result()
                        except Exception:
                            res = {"url": None, "status": "error", "content_type": "", "title": "", "outlinks": 0}
                        self.results.append(res)
                        pbar.update(1)
                    else:
                        remaining.append(f)
                futures = remaining
                # short sleep to avoid busy loop
                time.sleep(0.01)

                # safety: if queue empty and no futures, break
                if self.queue.empty() and not futures:
                    break

        pbar.close()
        elapsed = time.time() - start_time
        # produce DataFrame
        df = pd.DataFrame(self.results)
        if df.empty:
            # ensure consistent columns
            df = pd.DataFrame(columns=["url", "status", "content_type", "title", "outlinks"])
        df["crawl_time_s"] = elapsed
        return df

# ----------------- Set options & Run -----------------
# Edit values below as needed:
start_url = "https://codefrydev.in"      # <<--- change this to your site
max_pages = 10000                          # None or an int limit
concurrency = 8
timeout = 12
ignore_robots = False
allow_external = False
max_depth = 6                            # None or integer
polite_delay = 0.2                       # small delay to be polite (seconds)

print("Starting crawler (this cell will run until the crawl completes or hits max_pages)...")
crawler = NotebookCrawler(
    start_url=start_url,
    max_pages=max_pages,
    concurrency=concurrency,
    timeout=timeout,
    ignore_robots=ignore_robots,
    allow_external=allow_external,
    max_depth=max_depth,
    polite_delay=polite_delay
)

df = crawler.crawl(show_progress=True)

# Show results
print(f"\nCrawl finished: {len(df)} rows, took {df['crawl_time_s'].iloc[0]:.2f}s (wall time).")
display(df.head(40))  # top results in notebook
# Save CSV locally
out_csv = "crawl_results.csv"
df.to_csv(out_csv, index=False)
print(f"Saved results to: {out_csv}")