"""
Website crawler: threaded, respects robots.txt, returns DataFrame and optional CSV.
"""
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from typing import Optional
from urllib.parse import urlparse

import pandas as pd
import requests
from tqdm.auto import tqdm

from .common import load_robots, normalize_link, parse_links, parse_seo

DEFAULT_USER_AGENT = "WebsiteProfilingCrawler/1.0"


class Crawler:
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
        polite_delay: float = 0.0,
        store_outlinks: bool = False,
    ):
        self.start_url = start_url.rstrip("/")
        self.start_netloc = urlparse(self.start_url).netloc
        self.max_pages = (
            max_pages if (max_pages is not None and max_pages > 0) else float("inf")
        )
        self.concurrency = max(1, int(concurrency))
        self.timeout = timeout
        self.ignore_robots = ignore_robots
        self.allow_external = allow_external
        self.max_depth = None if max_depth is None else int(max_depth)
        self.user_agent = user_agent or DEFAULT_USER_AGENT
        self.polite_delay = max(0.0, float(polite_delay))
        self.store_outlinks = store_outlinks

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
            t0 = time.perf_counter()
            resp = self.session.get(
                url, timeout=self.timeout, allow_redirects=True
            )
            response_time_ms = int((time.perf_counter() - t0) * 1000)
            ct = resp.headers.get("Content-Type", "")
            is_html = resp.status_code == 200 and (
                "text/html" in ct or "application/xhtml+xml" in ct
            )
            text = resp.text if is_html else None
            content_length = len(resp.content) if resp.content is not None else 0
            final_url = resp.url or url
            return (
                resp.status_code,
                ct,
                text,
                response_time_ms,
                content_length,
                final_url,
            )
        except Exception:
            return None, None, None, None, None, None

    def _empty_seo(self, url: str) -> dict:
        """Default SEO/performance fields when no HTML or error."""
        return {
            "response_time_ms": "",
            "content_length": 0,
            "final_url": url,
            "meta_description": "",
            "meta_description_len": 0,
            "h1": "",
            "h1_count": 0,
            "canonical_url": "",
        }

    def worker(self, url):
        if not self.allowed_by_robots(url):
            out = {
                "url": url,
                "status": "blocked_by_robots",
                "content_type": "",
                "title": "",
                "outlinks": 0,
                **self._empty_seo(url),
            }
            if self.store_outlinks:
                out["outlink_targets"] = "[]"
            return out

        result = self.fetch(url)
        status, ct, text = result[0], result[1], result[2]
        response_time_ms = result[3] if len(result) > 3 else None
        content_length = result[4] if len(result) > 4 else 0
        final_url = result[5] if len(result) > 5 else url

        if status is None:
            out = {
                "url": url,
                "status": "error",
                "content_type": "",
                "title": "",
                "outlinks": 0,
                **self._empty_seo(url),
            }
            if self.store_outlinks:
                out["outlink_targets"] = "[]"
            return out

        title = ""
        outlinks_count = 0
        outlink_list = []
        meta_description = ""
        meta_description_len = 0
        h1_text = ""
        h1_count = 0
        canonical_url = ""

        if text:
            title, links = parse_links(url, text)
            outlinks_count = len(links)
            meta_description, meta_description_len, h1_text, h1_count, canonical_url = (
                parse_seo(url, text)
            )
            for link in links:
                if not self.allow_external and not self.same_domain(link):
                    continue
                cur_depth = self.depths.get(url, 0)
                if self.max_depth is not None and cur_depth >= self.max_depth:
                    continue
                with self.lock:
                    if (
                        link not in self.visited
                        and link not in self.depths
                        and not self._queue_contains(link)
                    ):
                        self.queue.put(link)
                        self.depths[link] = cur_depth + 1
                if self.store_outlinks:
                    outlink_list.append(link)

        if self.polite_delay:
            time.sleep(self.polite_delay)

        res = {
            "url": url,
            "status": status,
            "content_type": ct or "",
            "title": title,
            "outlinks": outlinks_count,
            "response_time_ms": response_time_ms if response_time_ms is not None else "",
            "content_length": content_length or 0,
            "final_url": final_url or url,
            "meta_description": meta_description,
            "meta_description_len": meta_description_len,
            "h1": h1_text,
            "h1_count": h1_count,
            "canonical_url": canonical_url,
        }
        if self.store_outlinks:
            res["outlink_targets"] = json.dumps(list(outlink_list))
        return res

    def _queue_contains(self, item):
        try:
            return item in list(self.queue.queue)
        except Exception:
            return False

    def crawl(self, show_progress: bool = True):
        start_time = time.time()
        futures = []
        pbar = tqdm(
            total=None if self.max_pages == float("inf") else int(self.max_pages),
            desc="Pages",
            disable=not show_progress,
        )
        with ThreadPoolExecutor(max_workers=self.concurrency) as ex:
            while (len(self.results) < self.max_pages) and (
                not self.queue.empty() or futures
            ):
                while (
                    not self.queue.empty()
                    and len(futures) < self.concurrency
                    and len(self.results) + len(futures) < self.max_pages
                ):
                    url = self.queue.get()
                    with self.lock:
                        if url in self.visited:
                            continue
                        self.visited.add(url)
                    futures.append(ex.submit(self.worker, url))

                remaining = []
                for f in futures:
                    if f.done():
                        try:
                            res = f.result()
                        except Exception:
                            res = {
                                "url": None,
                                "status": "error",
                                "content_type": "",
                                "title": "",
                                "outlinks": 0,
                                "response_time_ms": "",
                                "content_length": 0,
                                "final_url": "",
                                "meta_description": "",
                                "meta_description_len": 0,
                                "h1": "",
                                "h1_count": 0,
                                "canonical_url": "",
                            }
                            if self.store_outlinks:
                                res["outlink_targets"] = "[]"
                        self.results.append(res)
                        pbar.update(1)
                    else:
                        remaining.append(f)
                futures = remaining
                time.sleep(0.01)

                if self.queue.empty() and not futures:
                    break

        pbar.close()
        elapsed = time.time() - start_time
        df = pd.DataFrame(self.results)
        if df.empty:
            cols = [
                "url",
                "status",
                "content_type",
                "title",
                "outlinks",
                "response_time_ms",
                "content_length",
                "final_url",
                "meta_description",
                "meta_description_len",
                "h1",
                "h1_count",
                "canonical_url",
            ]
            if self.store_outlinks:
                cols.append("outlink_targets")
            df = pd.DataFrame(columns=cols)
        df["crawl_time_s"] = elapsed
        return df


def run_crawler(
    start_url: str,
    max_pages: Optional[int] = None,
    concurrency: int = 8,
    timeout: int = 12,
    ignore_robots: bool = False,
    allow_external: bool = False,
    max_depth: Optional[int] = None,
    polite_delay: float = 0.2,
    store_outlinks: bool = True,
    output_csv: Optional[str] = "crawl_results.csv",
    show_progress: bool = True,
) -> pd.DataFrame:
    """Run crawler and optionally save CSV. Returns DataFrame."""
    crawler = Crawler(
        start_url=start_url,
        max_pages=max_pages,
        concurrency=concurrency,
        timeout=timeout,
        ignore_robots=ignore_robots,
        allow_external=allow_external,
        max_depth=max_depth,
        polite_delay=polite_delay,
        store_outlinks=store_outlinks,
    )
    df = crawler.crawl(show_progress=show_progress)
    if output_csv and not df.empty:
        df.to_csv(output_csv, index=False)
    return df
