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

from ..common import (
    detect_tech_wappalyzer,
    load_robots,
    normalize_link,
    parse_content_text,
    parse_link_edges,
    parse_resources,
    parse_seo,
    parse_seo_extended,
    parse_social_meta,
    parse_tech_stack,
)
from ..analysis.page import analyze_html
from .discovery import (
    follow_links_for_mode,
    normalize_discovery_mode,
    seed_sitemap_for_mode,
)
from .extraction import parse_extractors_config, run_extractors
from .fetchers import build_fetcher
from .fetchers.base import FetchResult
from .fetchers.browser_diagnostics import merge_browser_into_page_analysis
from .fetchers.hybrid import HybridFetcher
from .fetchers.spa_heuristics import needs_js_render_after_parse
from .sitemap import discover_sitemap_urls

DEFAULT_USER_AGENT = "WebsiteProfilingCrawler/1.0"
MOBILE_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def resolve_crawl_user_agent(preset: str | None, custom: str | None, default: str | None = None) -> str:
    p = (preset or "default").strip().lower()
    if p == "mobile":
        return MOBILE_USER_AGENT
    if p == "custom" and custom and str(custom).strip():
        return str(custom).strip()
    return (default or DEFAULT_USER_AGENT).strip() or DEFAULT_USER_AGENT


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
        store_content_excerpt: bool = False,
        content_excerpt_max_chars: int = 4096,
        render_mode: str = "static",
        js_concurrency: int = 3,
        js_timeout: int = 30,
        js_wait_until: str = "domcontentloaded",
        js_extra_wait_ms: int = 1500,
        js_block_resources: bool = True,
        capture_console: bool = True,
        js_console_levels: str = "error,warning",
        capture_failed_requests: bool = False,
        console_max_per_page: int = 20,
        custom_extraction_regex: str = "",
        crawl_ignore_params: Optional[list[str]] = None,
        discovery_mode: str = "spider",
        crawl_url_list: Optional[list[str]] = None,
        crawl_user_agent_preset: str = "default",
        crawl_user_agent_custom: str = "",
        crawl_auth_username: str = "",
        crawl_auth_password: str = "",
        crawl_extra_headers: str = "",
        crawl_cookies: str = "",
        crawl_robots_txt_override: str = "",
        custom_extractors: Optional[list[dict]] = None,
        enable_axe: bool = False,
    ):
        self.start_url = start_url.rstrip("/")
        self.start_netloc = urlparse(self.start_url).netloc
        self.discovery_mode = normalize_discovery_mode(discovery_mode)
        self.follow_links = follow_links_for_mode(self.discovery_mode)
        self.crawl_url_list = [u.rstrip("/") for u in (crawl_url_list or []) if u and str(u).strip()]
        self.link_edges_accum: list[dict] = []
        self.render_mode = (render_mode or "static").strip().lower()
        self.js_concurrency = max(1, int(js_concurrency))
        effective_concurrency = (
            self.js_concurrency
            if self.render_mode == "javascript"
            else max(1, int(concurrency))
        )
        self.max_pages = (
            max_pages if (max_pages is not None and max_pages > 0) else float("inf")
        )
        self.concurrency = effective_concurrency
        self.timeout = timeout
        self.ignore_robots = ignore_robots
        self.allow_external = allow_external
        self.max_depth = None if max_depth is None else int(max_depth)
        self.user_agent = resolve_crawl_user_agent(
            crawl_user_agent_preset, crawl_user_agent_custom, user_agent
        )
        self.polite_delay = max(0.0, float(polite_delay))
        self.store_outlinks = store_outlinks
        self.exclude_urls = list(exclude_urls) if exclude_urls else []
        self.use_wappalyzer = use_wappalyzer
        self.store_content_excerpt = bool(store_content_excerpt)
        self.content_excerpt_max_chars = max(0, int(content_excerpt_max_chars or 0))
        self._wappalyzer_instance = None
        self.custom_extraction_regex = (custom_extraction_regex or "").strip()
        self.custom_extractors = list(custom_extractors or [])
        self.crawl_ignore_params = list(crawl_ignore_params or [])

        self.queue = Queue()
        self.depths: dict[str, int] = {}
        self.visited = set()
        self.results = []
        self.lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self.user_agent})
        if crawl_auth_username:
            self.session.auth = (crawl_auth_username, crawl_auth_password or "")
        for line in (crawl_extra_headers or "").replace("\r", "").split("\n"):
            if ":" in line:
                key, val = line.split(":", 1)
                k, v = key.strip(), val.strip()
                if k:
                    self.session.headers[k] = v
        if crawl_cookies and str(crawl_cookies).strip():
            self.session.headers["Cookie"] = str(crawl_cookies).strip()
        self.rp = None
        if not self.ignore_robots:
            override = (crawl_robots_txt_override or "").strip()
            if override:
                import io
                import urllib.robotparser as robotparser

                self.rp = robotparser.RobotFileParser()
                self.rp.parse(override.splitlines())
            else:
                self.rp = load_robots(self.start_url)
        self.fetcher = build_fetcher(
            render_mode="javascript" if self.render_mode == "javascript" else ("auto" if self.render_mode == "auto" else "static"),
            timeout=timeout,
            user_agent=self.user_agent,
            session=self.session,
            js_concurrency=self.js_concurrency,
            js_timeout=js_timeout,
            js_wait_until=js_wait_until,
            js_extra_wait_ms=js_extra_wait_ms,
            js_block_resources=js_block_resources,
            capture_console=capture_console,
            js_console_levels=js_console_levels,
            capture_failed_requests=capture_failed_requests,
            console_max_per_page=console_max_per_page,
            run_axe=enable_axe,
        )
        self._hybrid_fetcher = (
            self.fetcher if isinstance(self.fetcher, HybridFetcher) else None
        )
        self._seed_initial_urls(timeout)

    def _enqueue_seed(self, url: str, depth: int = 0) -> None:
        u = url.rstrip("/")
        if _url_matches_exclude(u, self.exclude_urls):
            return
        if not self.allow_external and not self.same_domain(u):
            return
        if u in self.depths:
            return
        self.queue.put(u)
        self.depths[u] = depth

    def _seed_initial_urls(self, timeout: int) -> None:
        mode = self.discovery_mode
        if mode in ("list", "hybrid"):
            for url in self.crawl_url_list:
                self._enqueue_seed(url, 0)
        if mode in ("spider", "hybrid"):
            self._enqueue_seed(self.start_url, 0)
        if seed_sitemap_for_mode(mode):
            self._seed_sitemap_urls(timeout)

    def same_domain(self, url):
        return urlparse(url).netloc == self.start_netloc

    def allowed_by_robots(self, url):
        if self.ignore_robots or not self.rp:
            return True
        try:
            return self.rp.can_fetch(self.user_agent, url)
        except Exception:
            return True

    def _seed_sitemap_urls(self, timeout: int) -> None:
        try:
            seeds = discover_sitemap_urls(
                self.start_url,
                timeout=timeout,
                session=self.session,
            )
        except Exception:
            return
        for url in seeds:
            self._enqueue_seed(url, 0)

    def fetch(self, url) -> FetchResult:
        return self.fetcher.fetch(url)

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
            "content_excerpt": "",
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

    def _parse_page_content(
        self,
        url: str,
        text: str,
        final_url: str,
        headers_dict: dict,
        redirect_chain_length: int,
    ) -> dict:
        """Extract title, links, and SEO/content fields from HTML."""
        ext = self._empty_seo(url, headers_dict, redirect_chain_length)
        title, link_edge_rows = parse_link_edges(url, text)
        links = {e["to_url"] for e in link_edge_rows}
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
        excerpt_max = self.content_excerpt_max_chars if self.store_content_excerpt else 0
        ct_data = parse_content_text(_soup, text, excerpt_max_chars=excerpt_max)
        ext["word_count"] = ct_data.get("word_count", 0)
        ext["reading_level"] = ct_data.get("reading_level", 0.0)
        ext["content_html_ratio"] = ct_data.get("content_html_ratio", 0.0)
        ext["top_keywords"] = ct_data.get("top_keywords", "[]")
        ext["content_excerpt"] = ct_data.get("content_excerpt") or ""
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
        return {
            "title": title,
            "links": links,
            "link_edges": link_edge_rows,
            "meta_description": meta_description,
            "meta_description_len": meta_description_len,
            "h1_text": h1_text,
            "h1_count": h1_count,
            "canonical_url": canonical_url,
            "ext": ext,
        }

    def _maybe_refetch_after_parse(
        self,
        url: str,
        result: FetchResult,
        *,
        link_count: int,
        same_domain_link_count: int,
    ) -> FetchResult:
        """Post-parse auto-mode fallback when static HTML has too few links."""
        if self.render_mode != "auto" or self._hybrid_fetcher is None:
            return result
        if result.fetch_method != "static":
            return result
        if not needs_js_render_after_parse(
            result,
            link_count=link_count,
            same_domain_link_count=same_domain_link_count,
        ):
            return result
        rendered = self._hybrid_fetcher.refetch_rendered(url)
        if rendered.status == 200 and rendered.text:
            return rendered
        return result

    @staticmethod
    def _sync_from_fetch_result(
        result: FetchResult,
        url: str,
        *,
        text: Optional[str],
        fetch_method: str,
        final_url: str,
        content_length: int,
        response_time_ms: Optional[int],
        headers_dict: dict,
        redirect_chain_length: int,
        status: Optional[int],
        ct: Optional[str],
    ) -> dict:
        """Copy all FetchResult fields after a post-parse browser refetch."""
        return {
            "text": result.text,
            "fetch_method": result.fetch_method,
            "final_url": result.final_url or url,
            "content_length": result.content_length or content_length,
            "response_time_ms": result.response_time_ms,
            "headers_dict": result.headers_dict or headers_dict,
            "redirect_chain_length": result.redirect_chain_length,
            "status": result.status,
            "ct": result.content_type,
        }

    def worker(self, url):
        if not self.allowed_by_robots(url):
            out = {
                "url": url,
                "status": "blocked_by_robots",
                "content_type": "",
                "title": "",
                "outlinks": 0,
                "fetch_method": "static",
                **self._empty_seo(url),
            }
            if self.store_outlinks:
                out["outlink_targets"] = "[]"
            return out

        result = self.fetch(url)
        status = result.status
        ct = result.content_type
        text = result.text
        response_time_ms = result.response_time_ms
        content_length = result.content_length or 0
        final_url = result.final_url or url
        headers_dict = result.headers_dict or {}
        redirect_chain_length = result.redirect_chain_length
        fetch_method = result.fetch_method

        if status is None:
            out = {
                "url": url,
                "status": "error",
                "content_type": "",
                "title": "",
                "outlinks": 0,
                "fetch_method": fetch_method,
                **self._empty_seo(url, headers_dict, redirect_chain_length),
            }
            if self.store_outlinks:
                out["outlink_targets"] = "[]"
            if result.browser_diagnostics:
                out["page_analysis"] = merge_browser_into_page_analysis(
                    None, result.browser_diagnostics
                )
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
            parsed = self._parse_page_content(
                url, text, final_url or url, headers_dict, redirect_chain_length
            )
            links = parsed["links"]
            same_domain_link_count = sum(1 for link in links if self.same_domain(link))
            result = self._maybe_refetch_after_parse(
                url,
                result,
                link_count=len(links),
                same_domain_link_count=same_domain_link_count,
            )
            if result.text and result.text != text:
                synced = self._sync_from_fetch_result(
                    result,
                    url,
                    text=text,
                    fetch_method=fetch_method,
                    final_url=final_url,
                    content_length=content_length,
                    response_time_ms=response_time_ms,
                    headers_dict=headers_dict,
                    redirect_chain_length=redirect_chain_length,
                    status=status,
                    ct=ct,
                )
                text = synced["text"]
                fetch_method = synced["fetch_method"]
                final_url = synced["final_url"]
                content_length = synced["content_length"]
                response_time_ms = synced["response_time_ms"]
                headers_dict = synced["headers_dict"]
                redirect_chain_length = synced["redirect_chain_length"]
                status = synced["status"]
                ct = synced["ct"]
                parsed = self._parse_page_content(
                    url, text, final_url, headers_dict, redirect_chain_length
                )
                links = parsed["links"]

            title = parsed["title"]
            outlinks_count = len(links)
            meta_description = parsed["meta_description"]
            meta_description_len = parsed["meta_description_len"]
            h1_text = parsed["h1_text"]
            h1_count = parsed["h1_count"]
            canonical_url = parsed["canonical_url"]
            ext = parsed["ext"]

            if self.crawl_ignore_params:
                from ..common import strip_crawl_query_params

                links = [strip_crawl_query_params(l, self.crawl_ignore_params) for l in links]

            link_edge_rows = parsed.get("link_edges") or []
            for edge in link_edge_rows:
                link = edge.get("to_url") or ""
                if self.store_outlinks:
                    outlink_list.append(link)
                    self.link_edges_accum.append({"from_url": url, **edge})
                if not self.follow_links:
                    continue
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

        if self.custom_extraction_regex and text:
            import re

            try:
                match = re.search(self.custom_extraction_regex, text)
                if match:
                    ext["custom_extract"] = match.group(1) if match.lastindex else match.group(0)
            except re.error:
                pass

        if self.custom_extractors and text:
            fields = run_extractors(text, self.custom_extractors)
            if fields:
                ext["custom_fields"] = json.dumps(fields)

        if self.polite_delay:
            time.sleep(self.polite_delay)

        if result.browser_diagnostics:
            ext["page_analysis"] = merge_browser_into_page_analysis(
                ext.get("page_analysis"), result.browser_diagnostics
            )

        res = {
            "url": url,
            "status": status,
            "content_type": ct or "",
            "title": title,
            "outlinks": outlinks_count,
            "fetch_method": fetch_method,
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

    def crawl(
        self,
        show_progress: bool = True,
        stream_crawl_run_id: Optional[int] = None,
        stream_batch_size: int = 500,
    ):
        start_time = time.time()
        futures = []
        db_writer: Optional[_CrawlDbWriter] = None
        if stream_crawl_run_id is not None:
            db_writer = _CrawlDbWriter(stream_crawl_run_id, stream_batch_size)
            db_writer.start()
        pbar = tqdm(
            total=None if self.max_pages == float("inf") else int(self.max_pages),
            desc="Pages",
            disable=not show_progress,
        )
        try:
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
                                    "content_excerpt": "",
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
                            if db_writer is not None and res.get("url"):
                                db_writer.enqueue(res)
                            pbar.update(1)
                        else:
                            remaining.append(f)
                    futures = remaining
                    time.sleep(0.01)

                    if self.queue.empty() and not futures:
                        break
        finally:
            self.fetcher.close()
            pbar.close()
        if db_writer is not None:
            db_writer.finish()
            db_writer.join()
            db_writer.raise_if_failed()
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
                "content_excerpt",
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
                "fetch_method",
            ]
            if self.store_outlinks:
                cols.append("outlink_targets")
            df = pd.DataFrame(columns=cols)
        df["crawl_time_s"] = elapsed
        return df


class _CrawlDbWriter(threading.Thread):
    """Background thread: batch-insert crawl rows via PostgreSQL connection pool."""

    def __init__(self, crawl_run_id: int, batch_size: int = 500) -> None:
        super().__init__(daemon=True)
        self.crawl_run_id = crawl_run_id
        self.batch_size = max(50, batch_size)
        self._queue: Queue = Queue()
        self._error: Optional[BaseException] = None

    def enqueue(self, record: dict) -> None:
        self._queue.put(record)

    def finish(self) -> None:
        self._queue.put(None)

    def run(self) -> None:
        from ..db import db_session
        from ..db.crawl_store import _crawl_rows_from_df, write_crawl_batch

        buffer: list[dict] = []
        try:
            while True:
                item = self._queue.get()
                if item is None:
                    if buffer:
                        chunk = pd.DataFrame(buffer)
                        with db_session() as conn:
                            rows = _crawl_rows_from_df(chunk, self.crawl_run_id)
                            write_crawl_batch(conn, rows, self.crawl_run_id, commit=True)
                    break
                buffer.append(item)
                if len(buffer) >= self.batch_size:
                    chunk = pd.DataFrame(buffer)
                    buffer = []
                    with db_session() as conn:
                        rows = _crawl_rows_from_df(chunk, self.crawl_run_id)
                        write_crawl_batch(conn, rows, self.crawl_run_id, commit=True)
        except BaseException as e:
            self._error = e

    def raise_if_failed(self) -> None:
        if self._error is not None:
            raise self._error


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
    output_db: bool = False,
    show_progress: bool = True,
    exclude_urls: Optional[list[str]] = None,
    preserve_crawl_history: bool = True,
    store_content_excerpt: bool = False,
    content_excerpt_max_chars: int = 4096,
    crawl_stream_to_db: bool = False,
    property_id: Optional[int] = None,
    render_mode: str = "static",
    js_concurrency: int = 3,
    js_timeout: int = 30,
    js_wait_until: str = "domcontentloaded",
    js_extra_wait_ms: int = 1500,
    js_block_resources: bool = True,
    capture_console: bool = True,
    js_console_levels: str = "error,warning",
    capture_failed_requests: bool = False,
    console_max_per_page: int = 20,
    custom_extraction_regex: str = "",
    crawl_ignore_params: Optional[list[str]] = None,
    discovery_mode: str = "spider",
    crawl_url_list: Optional[list[str]] = None,
    crawl_user_agent_preset: str = "default",
    crawl_user_agent_custom: str = "",
    crawl_auth_username: str = "",
    crawl_auth_password: str = "",
    crawl_extra_headers: str = "",
    crawl_cookies: str = "",
    crawl_robots_txt_override: str = "",
    custom_extractors: Optional[list] = None,
    enable_axe: bool = False,
) -> pd.DataFrame:
    """Run crawler and optionally save to CSV/JSON or PostgreSQL. Returns DataFrame."""
    import sys
    max_p = max_pages if max_pages is not None else 0
    mode_label = (render_mode or "static").strip().lower()
    disc_label = normalize_discovery_mode(discovery_mode)
    conc_label = js_concurrency if mode_label == "javascript" else concurrency
    print(
        f"  Crawling {start_url} (max_pages={max_p or 'unlimited'}, "
        f"discovery={disc_label}, render_mode={mode_label}, concurrency={conc_label})...",
        flush=True,
    )
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
        store_content_excerpt=store_content_excerpt,
        content_excerpt_max_chars=content_excerpt_max_chars,
        render_mode=render_mode,
        js_concurrency=js_concurrency,
        js_timeout=js_timeout,
        js_wait_until=js_wait_until,
        js_extra_wait_ms=js_extra_wait_ms,
        js_block_resources=js_block_resources,
        capture_console=capture_console,
        js_console_levels=js_console_levels,
        capture_failed_requests=capture_failed_requests,
        console_max_per_page=console_max_per_page,
        custom_extraction_regex=custom_extraction_regex,
        crawl_ignore_params=crawl_ignore_params,
        discovery_mode=disc_label,
        crawl_url_list=crawl_url_list,
        crawl_user_agent_preset=crawl_user_agent_preset,
        crawl_user_agent_custom=crawl_user_agent_custom,
        crawl_auth_username=crawl_auth_username,
        crawl_auth_password=crawl_auth_password,
        crawl_extra_headers=crawl_extra_headers,
        crawl_cookies=crawl_cookies,
        crawl_robots_txt_override=crawl_robots_txt_override,
        custom_extractors=custom_extractors,
        enable_axe=enable_axe,
    )
    stream_run_id: Optional[int] = None
    if output_db:
        use_stream = crawl_stream_to_db or (max_pages is not None and max_pages > 100)
        if use_stream:
            from ..db import backup_db_if_exists, create_crawl_run, db_session, read_historical_data, restore_historical_data
            from ..db.storage import ensure_crawl_tables_cleared

            historical = {}
            if not preserve_crawl_history:
                historical = read_historical_data()
                backup_path = backup_db_if_exists()
                if backup_path:
                    print(f"  Backed up existing DB to {backup_path}", flush=True)
            with db_session() as conn:
                if not preserve_crawl_history:
                    ensure_crawl_tables_cleared(conn)
                if historical:
                    restore_historical_data(conn, historical)
                stream_run_id = create_crawl_run(
                    conn, start_url, property_id=property_id, render_mode=render_mode,
                    discovery_mode=disc_label,
                )
            print(f"  Streaming crawl results to DB (run_id={stream_run_id})...", flush=True)

    df = crawler.crawl(
        show_progress=show_progress,
        stream_crawl_run_id=stream_run_id,
    )
    if output_db and crawler.link_edges_accum:
        from ..db import db_session
        from ..db.crawl_store import write_link_edges

        run_id = stream_run_id
        if run_id is None:
            with db_session() as conn:
                from ..db.crawl_store import get_latest_crawl_run_id

                run_id = get_latest_crawl_run_id(conn)
        if run_id is not None:
            with db_session() as conn:
                write_link_edges(conn, crawler.link_edges_accum, crawl_run_id=run_id)
    if output_db and not df.empty and stream_run_id is None:
        import sys
        print("  Writing crawl results to DB...", flush=True)
        from ..db import backup_db_if_exists, create_crawl_run, db_session, read_historical_data, restore_historical_data, write_crawl
        from ..db.storage import ensure_crawl_tables_cleared
        historical = {}
        backup_path = None
        if not preserve_crawl_history:
            historical = read_historical_data()
            n_reports = len(historical.get("report_payload", []))
            if n_reports:
                print(f"  Preserving {n_reports} historical report(s) from existing DB...", flush=True)
            backup_path = backup_db_if_exists()
            if backup_path:
                print(f"  Backed up existing DB to {backup_path}", flush=True)
        with db_session() as conn:
            if not preserve_crawl_history:
                ensure_crawl_tables_cleared(conn)
            if historical:
                restore_historical_data(conn, historical)
            run_id = create_crawl_run(
                conn, start_url, property_id=property_id, render_mode=render_mode,
                discovery_mode=disc_label,
            )
            write_crawl(conn, df, crawl_run_id=run_id)
            if crawler.link_edges_accum:
                from ..db.crawl_store import write_link_edges

                write_link_edges(conn, crawler.link_edges_accum, crawl_run_id=run_id)
        print("  Crawl DB write complete.", flush=True)
    elif output_db and stream_run_id is not None:
        print("  Crawl streamed to DB during fetch.", flush=True)
    elif output_csv and not df.empty:
        if output_csv.lower().endswith(".json"):
            df.to_json(output_csv, orient="records", indent=2, date_format="iso", default_handler=str)
        else:
            df.to_csv(output_csv, index=False)
    return df
