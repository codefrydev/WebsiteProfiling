"""
Website crawler: threaded, respects robots.txt, returns DataFrame and optional CSV.
"""
from __future__ import annotations

import json
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Optional

import pandas as pd
import requests
from tqdm.auto import tqdm

from ..console_io import console_print
from ..common import strip_crawl_query_params
from .config import (
    DEFAULT_USER_AGENT,
    MOBILE_USER_AGENT,
    CrawlConfig,
    resolve_crawl_user_agent,
)
from .db_writer import CrawlDbWriter, _CrawlDbWriter
from .discovery import normalize_discovery_mode
from .fetchers import build_fetcher
from .sitemap import discover_sitemap_urls
from .fetchers.base import FetchResult
from .fetchers.hybrid import HybridFetcher
from .frontier import CrawlFrontier, url_matches_exclude
from .page_record import PageRecordBuilder
from .schema import crawl_dataframe_columns, empty_crawl_row

# Re-export for backward compatibility.
_url_matches_exclude = url_matches_exclude

__all__ = [
    "Crawler",
    "run_crawler",
    "resolve_crawl_user_agent",
    "DEFAULT_USER_AGENT",
    "MOBILE_USER_AGENT",
    "_url_matches_exclude",
    "_CrawlDbWriter",
]


def _build_configured_session(config: CrawlConfig) -> requests.Session:
    """Build a session configured from crawl auth/headers/cookies.

    Called once per thread (and once for the main-thread template) so each
    worker thread fetches with its own session — see ``StaticFetcher``.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": config.user_agent})
    if config.crawl_auth_username:
        session.auth = (config.crawl_auth_username, config.crawl_auth_password or "")
    for line in (config.crawl_extra_headers or "").replace("\r", "").split("\n"):
        if ":" in line:
            key, val = line.split(":", 1)
            k, v = key.strip(), val.strip()
            if k:
                session.headers[k] = v
    if config.crawl_cookies and str(config.crawl_cookies).strip():
        session.headers["Cookie"] = str(config.crawl_cookies).strip()
    return session


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
        store_page_html: bool = False,
        max_stored_html_bytes: int = 2_097_152,
        run_content_analysis: bool = False,
        content_analysis_strategy: str = "main_only",
        content_analysis_workers: int = 4,
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
        *,
        config: Optional[CrawlConfig] = None,
    ):
        if config is None:
            config = CrawlConfig.from_kwargs(
                start_url=start_url,
                max_pages=max_pages,
                concurrency=concurrency,
                timeout=timeout,
                ignore_robots=ignore_robots,
                allow_external=allow_external,
                max_depth=max_depth,
                user_agent=user_agent,
                polite_delay=polite_delay,
                store_outlinks=store_outlinks,
                exclude_urls=exclude_urls,
                use_wappalyzer=use_wappalyzer,
                store_content_excerpt=store_content_excerpt,
                content_excerpt_max_chars=content_excerpt_max_chars,
                store_page_html=store_page_html,
                max_stored_html_bytes=max_stored_html_bytes,
                run_content_analysis=run_content_analysis,
                content_analysis_strategy=content_analysis_strategy,
                content_analysis_workers=content_analysis_workers,
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
                discovery_mode=discovery_mode,
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
        config.normalized()
        self.config = config

        self.start_url = config.start_url
        self.discovery_mode = config.discovery_mode
        self.follow_links = config.follow_links
        self.crawl_url_list = config.crawl_url_list
        self.link_edges_accum: list[dict] = []
        self.render_mode = config.render_mode
        self.max_pages = config.max_pages
        self.concurrency = config.effective_concurrency
        self.timeout = config.timeout
        self.polite_delay = config.polite_delay
        self.store_outlinks = config.store_outlinks
        self.exclude_urls = config.exclude_urls
        self.crawl_ignore_params = config.crawl_ignore_params
        self.custom_extraction_regex = config.custom_extraction_regex
        self.custom_extractors = config.custom_extractors
        self.store_page_html = config.store_page_html
        self.max_stored_html_bytes = config.max_stored_html_bytes
        self._html_buffer: list[dict] = []
        self._db_writer: Optional[CrawlDbWriter] = None

        self.page_builder = PageRecordBuilder(
            use_wappalyzer=config.use_wappalyzer,
            store_content_excerpt=config.store_content_excerpt,
            content_excerpt_max_chars=config.content_excerpt_max_chars,
            defer_content_analysis=config.defer_content_analysis,
            custom_extraction_regex=config.custom_extraction_regex,
            custom_extractors=config.custom_extractors,
        )

        self.frontier = CrawlFrontier(
            config.start_url,
            allow_external=config.allow_external,
            max_depth=config.max_depth,
            exclude_urls=config.exclude_urls,
            follow_links=config.follow_links,
            ignore_robots=config.ignore_robots,
            user_agent=config.user_agent or DEFAULT_USER_AGENT,
            crawl_robots_txt_override=config.crawl_robots_txt_override,
        )
        self.queue = self.frontier.queue
        self.depths = self.frontier.depths
        self.visited = self.frontier.visited
        self.lock = self.frontier.lock

        self.results: list[dict] = []
        # `requests.Session` is not thread-safe, so worker threads each build
        # their own session from this factory (see StaticFetcher). The template
        # `self.session` below is only touched on the main thread (sitemap
        # seeding and Playwright auth mapping).
        self._session_factory = lambda: _build_configured_session(config)
        self.session = self._session_factory()

        self.fetcher = build_fetcher(
            render_mode=config.fetcher_render_mode,
            timeout=config.timeout,
            user_agent=config.user_agent,
            session=self.session,
            session_factory=self._session_factory,
            js_concurrency=config.js_concurrency,
            js_timeout=config.js_timeout,
            js_wait_until=config.js_wait_until,
            js_extra_wait_ms=config.js_extra_wait_ms,
            js_block_resources=config.js_block_resources,
            capture_console=config.capture_console,
            js_console_levels=config.js_console_levels,
            capture_failed_requests=config.capture_failed_requests,
            console_max_per_page=config.console_max_per_page,
            run_axe=config.enable_axe,
        )
        self._hybrid_fetcher = (
            self.fetcher if isinstance(self.fetcher, HybridFetcher) else None
        )
        self.frontier.seed_initial_urls(
            discovery_mode=config.discovery_mode,
            crawl_url_list=config.crawl_url_list,
            timeout=config.timeout,
            session=self.session,
        )

    @property
    def rp(self):
        return self.frontier.rp

    @rp.setter
    def rp(self, value) -> None:
        self.frontier.rp = value

    def same_domain(self, url: str) -> bool:
        return self.frontier.same_domain(url)

    def allowed_by_robots(self, url: str) -> bool:
        return self.frontier.allowed_by_robots(url)

    def _queue_contains(self, item: str) -> bool:
        return self.frontier.queue_contains(item)

    def fetch(self, url: str) -> FetchResult:
        return self.fetcher.fetch(url)

    def _capture_page_html(
        self,
        url: str,
        text: str | None,
        status: object,
        content_type: str | None,
        fetch_method: str,
    ) -> None:
        from .html_capture import build_page_html_record

        record = build_page_html_record(
            url=url,
            html=text or "",
            status=status,
            content_type=content_type,
            fetch_method=fetch_method,
            max_bytes=self.max_stored_html_bytes,
            enabled=self.store_page_html,
        )
        if record is None:
            return
        if self._db_writer is not None:
            self._db_writer.enqueue_html(record)
        else:
            self._html_buffer.append(record)

    def worker(self, url: str) -> dict:
        if not self.allowed_by_robots(url):
            return PageRecordBuilder.build_robots_blocked_row(
                url, store_outlinks=self.store_outlinks
            )

        result = self.fetch(url)
        if result.status is None:
            return PageRecordBuilder.build_fetch_error_row(
                url,
                result,
                fetch_method=result.fetch_method,
                store_outlinks=self.store_outlinks,
            )

        status = result.status
        ct = result.content_type
        text = result.text
        response_time_ms = result.response_time_ms
        content_length = result.content_length or 0
        final_url = result.final_url or url
        headers_dict = result.headers_dict or {}
        redirect_chain_length = result.redirect_chain_length
        fetch_method = result.fetch_method

        title = ""
        outlinks_count = 0
        outlink_list: list[str] = []
        meta_description = ""
        meta_description_len = 0
        h1_text = ""
        h1_count = 0
        canonical_url = ""

        ext = self.page_builder.empty_ext(url, headers_dict, redirect_chain_length)
        if text:
            parsed = self.page_builder.parse_page_content(
                url, text, final_url or url, headers_dict, redirect_chain_length
            )
            links = parsed["links"]
            same_domain_link_count = sum(1 for link in links if self.same_domain(link))
            result = PageRecordBuilder.maybe_refetch_after_parse(
                url,
                result,
                render_mode=self.render_mode,
                hybrid_fetcher=self._hybrid_fetcher,
                link_count=len(links),
                same_domain_link_count=same_domain_link_count,
            )
            if result.text and result.text != text:
                synced = PageRecordBuilder.sync_from_fetch_result(
                    result, url, content_length=content_length, headers_dict=headers_dict
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
                parsed = self.page_builder.parse_page_content(
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
                links = [strip_crawl_query_params(l, self.crawl_ignore_params) for l in links]

            link_edge_rows = parsed.get("link_edges") or []
            for edge in link_edge_rows:
                link = edge.get("to_url") or ""
                if self.store_outlinks:
                    outlink_list.append(link)
                    self.link_edges_accum.append({"from_url": url, **edge})
                self.frontier.try_enqueue_link(link, url)

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

        self.page_builder.apply_custom_extractions(ext, text)

        if self.polite_delay:
            time.sleep(self.polite_delay)

        PageRecordBuilder.merge_browser_diagnostics(ext, result)

        if text:
            self._capture_page_html(url, text, status, ct, fetch_method)

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

    def crawl(
        self,
        show_progress: bool = True,
        stream_crawl_run_id: Optional[int] = None,
        stream_batch_size: int = 500,
    ) -> pd.DataFrame:
        start_time = time.time()
        from ..progress import CrawlProgressTracker, emit_phase_start

        crawl_limit = None if self.max_pages == float("inf") else int(self.max_pages)
        progress_tracker = CrawlProgressTracker(
            crawl_limit,
            start_time=start_time,
            limit=crawl_limit,
        )
        emit_phase_start("crawl", message="Crawling pages")
        futures = []
        db_writer: Optional[CrawlDbWriter] = None
        pages_crawled = 0
        self._db_writer = None
        self._html_buffer = []
        if stream_crawl_run_id is not None:
            db_writer = _CrawlDbWriter(
                stream_crawl_run_id,
                stream_batch_size,
                store_page_html=self.store_page_html,
            )
            self._db_writer = db_writer
            db_writer.start()
        use_tqdm = show_progress and stream_crawl_run_id is None
        pbar = tqdm(
            total=None if self.max_pages == float("inf") else int(self.max_pages),
            desc="Pages",
            disable=not use_tqdm,
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
                        if self.frontier.should_skip_dequeued(url):
                            continue
                        if not self.frontier.mark_visited(url):
                            continue
                        futures.append(ex.submit(self.worker, url))

                    can_submit_more = (
                        not self.queue.empty()
                        and len(futures) < self.concurrency
                        and (len(self.results) + len(futures)) < self.max_pages
                    )
                    if futures and not can_submit_more:
                        # Block until at least one future completes instead of busy-polling.
                        # Covers both an empty frontier and a saturated worker pool; wait()
                        # returns immediately if a future is already done.
                        wait(futures, return_when=FIRST_COMPLETED)

                    remaining = []
                    for f in futures:
                        if f.done():
                            try:
                                res = f.result()
                            except Exception:
                                res = empty_crawl_row(status="error")
                                if self.store_outlinks:
                                    res["outlink_targets"] = "[]"
                            self.results.append(res)
                            page_url = (
                                str(res.get("url") or res.get("final_url") or "").strip() or None
                            )
                            pages_crawled += 1
                            if page_url and db_writer is not None:
                                db_writer.enqueue(res)
                            if use_tqdm:
                                pbar.update(1)
                            progress_tracker.maybe_emit(pages_crawled, page_url)
                        else:
                            remaining.append(f)
                    futures = remaining

                    if self.queue.empty() and not futures:
                        break
        finally:
            self.fetcher.close()
            progress_tracker.finish(pages_crawled)
            if use_tqdm:
                pbar.close()
        limit_label = (
            str(int(self.max_pages))
            if self.max_pages != float("inf")
            else "unlimited"
        )
        console_print(f"  Crawled {pages_crawled} URLs (limit {limit_label}).", flush=True)
        if db_writer is not None:
            db_writer.finish()
            db_writer.join()
            db_writer.raise_if_failed()
        self._db_writer = None
        elapsed = time.time() - start_time
        df = pd.DataFrame(self.results)
        if df.empty:
            df = pd.DataFrame(columns=crawl_dataframe_columns(store_outlinks=self.store_outlinks))
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
    output_db: bool = False,
    show_progress: bool = True,
    exclude_urls: Optional[list[str]] = None,
    preserve_crawl_history: bool = True,
    store_content_excerpt: bool = False,
    content_excerpt_max_chars: int = 4096,
    store_page_html: bool = False,
    max_stored_html_bytes: int = 2_097_152,
    run_content_analysis: bool = False,
    content_analysis_strategy: str = "main_only",
    content_analysis_workers: int = 4,
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
    max_p = max_pages if max_pages is not None else 0
    mode_label = (render_mode or "static").strip().lower()
    disc_label = normalize_discovery_mode(discovery_mode)
    conc_label = js_concurrency if mode_label == "javascript" else concurrency
    console_print(
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
        store_page_html=store_page_html,
        max_stored_html_bytes=max_stored_html_bytes,
        run_content_analysis=run_content_analysis,
        content_analysis_strategy=content_analysis_strategy,
        content_analysis_workers=content_analysis_workers,
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
                    console_print(f"  Backed up existing DB to {backup_path}", flush=True)
            with db_session() as conn:
                if not preserve_crawl_history:
                    ensure_crawl_tables_cleared(conn)
                if historical:
                    restore_historical_data(conn, historical)
                stream_run_id = create_crawl_run(
                    conn, start_url, property_id=property_id, render_mode=render_mode,
                    discovery_mode=disc_label,
                )
            console_print(f"  Streaming crawl results to DB (run_id={stream_run_id})...", flush=True)

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
        console_print("  Writing crawl results to DB...", flush=True)
        from ..db import backup_db_if_exists, create_crawl_run, db_session, read_historical_data, restore_historical_data, write_crawl
        from ..db.storage import ensure_crawl_tables_cleared
        historical = {}
        backup_path = None
        if not preserve_crawl_history:
            historical = read_historical_data()
            n_reports = len(historical.get("report_payload", []))
            if n_reports:
                console_print(f"  Preserving {n_reports} historical report(s) from existing DB...", flush=True)
            backup_path = backup_db_if_exists()
            if backup_path:
                console_print(f"  Backed up existing DB to {backup_path}", flush=True)
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
            html_buffer = getattr(crawler, "_html_buffer", None) or []
            if getattr(crawler, "store_page_html", False) and html_buffer:
                from ..db.html_store import write_page_html_batch

                write_page_html_batch(conn, html_buffer, run_id, commit=True)
            if crawler.link_edges_accum:
                from ..db.crawl_store import write_link_edges

                write_link_edges(conn, crawler.link_edges_accum, crawl_run_id=run_id)
        console_print("  Crawl DB write complete.", flush=True)
    elif output_db and stream_run_id is not None:
        console_print("  Crawl streamed to DB during fetch.", flush=True)
    elif output_csv and not df.empty:
        if output_csv.lower().endswith(".json"):
            df.to_json(output_csv, orient="records", indent=2, date_format="iso", default_handler=str)
        else:
            df.to_csv(output_csv, index=False)
    return df
