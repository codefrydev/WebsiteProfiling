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


def _url_matches_exclude(url: str, exclude_urls: list[str]) -> bool:
    """True if url equals or is under any exclude prefix (trailing-slash normalized)."""
    if not exclude_urls:
        return False
    u = url.rstrip("/")
    for prefix in exclude_urls:
        p = prefix.strip().rstrip("/")
        if not p:
            continue
        if u == p or u.startswith(p + "/"):
            return True
    return False

import pandas as pd
import requests
from tqdm.auto import tqdm

from .common import (
    detect_tech_wappalyzer,
    load_robots,
    normalize_link,
    parse_content_text,
    parse_links,
    parse_resources,
    parse_seo,
    parse_seo_extended,
    parse_social_meta,
    parse_tech_stack,
)
from .page_analysis import analyze_html

DEFAULT_USER_AGENT = "WebsiteProfilingCrawler/1.0"

# Headers we store for caching and security
HEADER_KEYS = (
    "Cache-Control",
    "ETag",
    "X-Robots-Tag",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Content-Security-Policy",
)


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
        exclude_urls: Optional[list[str]] = None,
        use_wappalyzer: bool = True,
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
        self.exclude_urls = list(exclude_urls) if exclude_urls else []
        self.use_wappalyzer = use_wappalyzer
        self._wappalyzer_instance = None
        if use_wappalyzer:
            try:
                from Wappalyzer import Wappalyzer
                self._wappalyzer_instance = Wappalyzer.latest()
            except Exception:
                pass

        self.queue = Queue()
        if not _url_matches_exclude(self.start_url, self.exclude_urls):
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
            redirect_chain_length = len(resp.history)
            headers_dict = {
                k: (resp.headers.get(k) or "") for k in HEADER_KEYS
            }
            return (
                resp.status_code,
                ct,
                text,
                response_time_ms,
                content_length,
                final_url,
                headers_dict,
                redirect_chain_length,
            )
        except Exception:
            return None, None, None, None, None, None, {}, 0

    def _empty_seo(self, url: str, headers_dict: Optional[dict] = None, redirect_chain_length: int = 0) -> dict:
        """Default SEO/performance fields when no HTML or error."""
        h = headers_dict or {}
        return {
            "response_time_ms": "",
            "content_length": 0,
            "final_url": url,
            "meta_description": "",
            "meta_description_len": 0,
            "h1": "",
            "h1_count": 0,
            "canonical_url": "",
            "viewport_present": False,
            "viewport_content": "",
            "noindex": False,
            "has_schema": False,
            "heading_sequence": "",
            "images_without_alt": 0,
            "images_total": 0,
            "img_without_lazy": 0,
            "img_without_dimensions": 0,
            "aria_count": 0,
            "mixed_content_count": 0,
            "redirect_chain_length": redirect_chain_length,
            "cache_control": h.get("Cache-Control", ""),
            "etag": h.get("ETag", ""),
            "x_robots_tag": h.get("X-Robots-Tag", ""),
            "strict_transport_security": h.get("Strict-Transport-Security", ""),
            "x_content_type_options": h.get("X-Content-Type-Options", ""),
            "x_frame_options": h.get("X-Frame-Options", ""),
            "content_security_policy": h.get("Content-Security-Policy", ""),
            "script_count": 0,
            "link_stylesheet_count": 0,
            "total_js_bytes": 0,
            "total_css_bytes": 0,
            "word_count": 0,
            "reading_level": 0.0,
            "content_html_ratio": 0.0,
            "top_keywords": "[]",
            "og_title": "",
            "og_description": "",
            "og_image": "",
            "og_type": "",
            "twitter_card": "",
            "twitter_title": "",
            "twitter_image": "",
            "tech_stack": "[]",
            "depth": None,
            "page_analysis": "{}",
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
        status = result[0]
        ct = result[1]
        text = result[2]
        response_time_ms = result[3] if len(result) > 3 else None
        content_length = result[4] if len(result) > 4 else 0
        final_url = result[5] if len(result) > 5 else url
        headers_dict = result[6] if len(result) > 6 else {}
        redirect_chain_length = result[7] if len(result) > 7 else 0

        if status is None:
            out = {
                "url": url,
                "status": "error",
                "content_type": "",
                "title": "",
                "outlinks": 0,
                **self._empty_seo(url, headers_dict, redirect_chain_length),
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

        ext = self._empty_seo(url, headers_dict, redirect_chain_length)
        if text:
            title, links = parse_links(url, text)
            outlinks_count = len(links)
            meta_description, meta_description_len, h1_text, h1_count, canonical_url = (
                parse_seo(url, text)
            )
            seo_ext = parse_seo_extended(text, final_url or url)
            ext["viewport_present"] = seo_ext.get("viewport_present", False)
            ext["viewport_content"] = seo_ext.get("viewport_content", "")
            ext["noindex"] = seo_ext.get("noindex", False)
            if (headers_dict.get("X-Robots-Tag") or "").lower().find("noindex") >= 0:
                ext["noindex"] = True
            ext["has_schema"] = seo_ext.get("has_schema", False)
            ext["heading_sequence"] = ",".join(seo_ext.get("heading_sequence") or [])
            ext["images_without_alt"] = seo_ext.get("images_without_alt", 0)
            ext["images_total"] = seo_ext.get("images_total", 0)
            ext["img_without_lazy"] = seo_ext.get("img_without_lazy", 0)
            ext["img_without_dimensions"] = seo_ext.get("img_without_dimensions", 0)
            ext["aria_count"] = seo_ext.get("aria_count", 0)
            ext["mixed_content_count"] = seo_ext.get("mixed_content_count", 0)
            res_res = parse_resources(text, final_url or url)
            ext["script_count"] = res_res.get("script_count", 0)
            ext["link_stylesheet_count"] = res_res.get("link_stylesheet_count", 0)
            from bs4 import BeautifulSoup as _BS
            _soup = _BS(text, "lxml")
            ct_data = parse_content_text(_soup, text)
            ext["word_count"] = ct_data.get("word_count", 0)
            ext["reading_level"] = ct_data.get("reading_level", 0.0)
            ext["content_html_ratio"] = ct_data.get("content_html_ratio", 0.0)
            ext["top_keywords"] = ct_data.get("top_keywords", "[]")
            social = parse_social_meta(_soup)
            ext["og_title"] = social.get("og_title", "")
            ext["og_description"] = social.get("og_description", "")
            ext["og_image"] = social.get("og_image", "")
            ext["og_type"] = social.get("og_type", "")
            ext["twitter_card"] = social.get("twitter_card", "")
            ext["twitter_title"] = social.get("twitter_title", "")
            ext["twitter_image"] = social.get("twitter_image", "")
            if self.use_wappalyzer:
                ext["tech_stack"] = detect_tech_wappalyzer(
                    final_url or url, text, headers_dict, _soup, self._wappalyzer_instance
                )
            else:
                ext["tech_stack"] = parse_tech_stack(_soup, headers_dict, final_url or url)
            ext["page_analysis"] = json.dumps(
                analyze_html(text, final_url or url, final_url or url, canonical_url)
            )
            for link in links:
                if _url_matches_exclude(link, self.exclude_urls):
                    continue
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

        ext["response_time_ms"] = response_time_ms if response_time_ms is not None else ""
        ext["content_length"] = content_length or 0
        ext["final_url"] = final_url or url
        ext["meta_description"] = meta_description
        ext["meta_description_len"] = meta_description_len
        ext["h1"] = h1_text
        ext["h1_count"] = h1_count
        ext["canonical_url"] = canonical_url
        ext["cache_control"] = headers_dict.get("Cache-Control", "")
        ext["etag"] = headers_dict.get("ETag", "")
        ext["x_robots_tag"] = headers_dict.get("X-Robots-Tag", "")
        ext["strict_transport_security"] = headers_dict.get("Strict-Transport-Security", "")
        ext["x_content_type_options"] = headers_dict.get("X-Content-Type-Options", "")
        ext["x_frame_options"] = headers_dict.get("X-Frame-Options", "")
        ext["content_security_policy"] = headers_dict.get("Content-Security-Policy", "")

        ext["depth"] = self.depths.get(url)

        if self.polite_delay:
            time.sleep(self.polite_delay)

        res = {
            "url": url,
            "status": status,
            "content_type": ct or "",
            "title": title,
            "outlinks": outlinks_count,
            **ext,
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
                    if _url_matches_exclude(url, self.exclude_urls):
                        continue
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
                                "viewport_present": False,
                                "viewport_content": "",
                                "noindex": False,
                                "has_schema": False,
                                "heading_sequence": "",
                                "images_without_alt": 0,
                                "images_total": 0,
                                "img_without_lazy": 0,
                                "img_without_dimensions": 0,
                                "aria_count": 0,
                                "mixed_content_count": 0,
                                "redirect_chain_length": 0,
                                "cache_control": "",
                                "etag": "",
                                "x_robots_tag": "",
                                "strict_transport_security": "",
                                "x_content_type_options": "",
                                "x_frame_options": "",
                                "content_security_policy": "",
                                "script_count": 0,
                                "link_stylesheet_count": 0,
                                "total_js_bytes": 0,
                                "total_css_bytes": 0,
                                "word_count": 0,
                                "reading_level": 0.0,
                                "content_html_ratio": 0.0,
                                "top_keywords": "[]",
                                "og_title": "",
                                "og_description": "",
                                "og_image": "",
                                "og_type": "",
                                "twitter_card": "",
                                "twitter_title": "",
                                "twitter_image": "",
                                "tech_stack": "[]",
                                "depth": None,
                                "page_analysis": "{}",
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
                "viewport_present",
                "viewport_content",
                "noindex",
                "has_schema",
                "heading_sequence",
                "images_without_alt",
                "images_total",
                "img_without_lazy",
                "img_without_dimensions",
                "aria_count",
                "mixed_content_count",
                "redirect_chain_length",
                "cache_control",
                "etag",
                "x_robots_tag",
                "strict_transport_security",
                "x_content_type_options",
                "x_frame_options",
                "content_security_policy",
                "script_count",
                "link_stylesheet_count",
                "total_js_bytes",
                "total_css_bytes",
                "word_count",
                "reading_level",
                "content_html_ratio",
                "top_keywords",
                "og_title",
                "og_description",
                "og_image",
                "og_type",
                "twitter_card",
                "twitter_title",
                "twitter_image",
                "tech_stack",
                "depth",
                "page_analysis",
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
    output_db: Optional[str] = None,
    show_progress: bool = True,
    exclude_urls: Optional[list[str]] = None,
    preserve_crawl_history: bool = False,
) -> pd.DataFrame:
    """Run crawler and optionally save to CSV/JSON or SQLite. Returns DataFrame."""
    import sys
    max_p = max_pages if max_pages is not None else 0
    print(f"  Crawling {start_url} (max_pages={max_p or 'unlimited'}, concurrency={concurrency})...", flush=True)
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
        exclude_urls=exclude_urls,
    )
    df = crawler.crawl(show_progress=show_progress)
    if output_db and not df.empty:
        import sys
        print("  Writing crawl results to DB...", flush=True)
        from .db import backup_db_if_exists, create_crawl_run, ensure_db_recreated, get_connection, init_schema, read_historical_data, restore_historical_data, write_crawl
        historical = {}
        backup_path = None
        if not preserve_crawl_history:
            historical = read_historical_data(output_db)
            n_reports = len(historical.get("report_payload", []))
            if n_reports:
                print(f"  Preserving {n_reports} historical report(s) from existing DB...", flush=True)
            backup_path = backup_db_if_exists(output_db)
            if backup_path:
                print(f"  Backed up existing DB to {backup_path}", flush=True)
            ensure_db_recreated(output_db)
        conn = get_connection(output_db)
        init_schema(conn)
        if historical:
            restore_historical_data(conn, historical)
            if backup_path:
                from pathlib import Path as _Path
                for p in (backup_path, backup_path + "-journal"):
                    try:
                        _Path(p).unlink(missing_ok=True)
                    except OSError:
                        pass
                print(f"  Removed temporary backup {backup_path}", flush=True)
        if preserve_crawl_history:
            run_id = create_crawl_run(conn, start_url)
            write_crawl(conn, df, crawl_run_id=run_id)
        else:
            write_crawl(conn, df)
        conn.close()
        print("  Crawl DB write complete.", flush=True)
    elif output_csv and not df.empty:
        if output_csv.lower().endswith(".json"):
            df.to_json(output_csv, orient="records", indent=2, date_format="iso", default_handler=str)
        else:
            df.to_csv(output_csv, index=False)
    return df
