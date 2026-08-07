"""Crawler configuration dataclass."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .discovery import follow_links_for_mode, normalize_discovery_mode

DEFAULT_USER_AGENT = "WebsiteProfilingCrawler/1.0"
MOBILE_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def resolve_crawl_user_agent(
    preset: str | None, custom: str | None, default: str | None = None
) -> str:
    p = (preset or "default").strip().lower()
    if p == "mobile":
        return MOBILE_USER_AGENT
    if p == "custom" and custom and str(custom).strip():
        return str(custom).strip()
    return (default or DEFAULT_USER_AGENT).strip() or DEFAULT_USER_AGENT


@dataclass
class CrawlConfig:
    start_url: str
    max_pages: Optional[int] = None
    concurrency: int = 6
    timeout: int = 12
    ignore_robots: bool = False
    allow_external: bool = False
    max_depth: Optional[int] = None
    user_agent: Optional[str] = None
    polite_delay: float = 0.0
    store_outlinks: bool = False
    exclude_urls: Optional[list[str]] = None
    use_wappalyzer: bool = True
    store_content_excerpt: bool = False
    content_excerpt_max_chars: int = 4096
    store_page_html: bool = False
    max_stored_html_bytes: int = 2_097_152
    max_pdf_bytes: int = 10_485_760
    run_content_analysis: bool = False
    content_analysis_strategy: str = "main_only"
    content_analysis_workers: int = 4
    render_mode: str = "static"
    js_concurrency: int = 3
    js_timeout: int = 30
    js_wait_until: str = "domcontentloaded"
    js_extra_wait_ms: int = 1500
    js_block_resources: bool = True
    capture_console: bool = True
    js_console_levels: str = "error,warning"
    capture_failed_requests: bool = False
    console_max_per_page: int = 20
    custom_extraction_regex: str = ""
    crawl_ignore_params: Optional[list[str]] = None
    discovery_mode: str = "spider"
    crawl_url_list: Optional[list[str]] = None
    crawl_user_agent_preset: str = "default"
    crawl_user_agent_custom: str = ""
    crawl_auth_username: str = ""
    crawl_auth_password: str = ""
    crawl_extra_headers: str = ""
    crawl_cookies: str = ""
    crawl_robots_txt_override: str = ""
    custom_extractors: Optional[list[dict]] = None
    main_content_selectors: str = ""
    boilerplate_selectors: str = ""
    enable_axe: bool = False
    compare_mobile_desktop: bool = False

    @classmethod
    def from_kwargs(cls, **kwargs: object) -> CrawlConfig:
        """Build config from Crawler keyword arguments (unknown keys ignored)."""
        fields = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in kwargs.items() if k in fields})

    def normalized(self) -> CrawlConfig:
        """Apply normalized derived fields in-place."""
        self.start_url = self.start_url.strip()
        self.discovery_mode = normalize_discovery_mode(self.discovery_mode)
        self.render_mode = (self.render_mode or "static").strip().lower()
        self.js_concurrency = max(1, int(self.js_concurrency))
        self.max_pages = (
            self.max_pages if (self.max_pages is not None and self.max_pages > 0) else float("inf")
        )
        self.max_depth = None if self.max_depth is None else int(self.max_depth)
        self.polite_delay = max(0.0, float(self.polite_delay))
        self.exclude_urls = list(self.exclude_urls) if self.exclude_urls else []
        self.store_content_excerpt = bool(self.store_content_excerpt)
        self.content_excerpt_max_chars = max(0, int(self.content_excerpt_max_chars or 0))
        self.store_page_html = bool(self.store_page_html)
        self.max_stored_html_bytes = max(1, int(self.max_stored_html_bytes or 2_097_152))
        self.max_pdf_bytes = max(1, int(self.max_pdf_bytes or 10_485_760))
        self.run_content_analysis = bool(self.run_content_analysis)
        strat = (self.content_analysis_strategy or "main_only").strip().lower()
        self.content_analysis_strategy = strat if strat in ("main_only", "full_body") else "main_only"
        self.content_analysis_workers = max(1, int(self.content_analysis_workers or 4))
        self.custom_extraction_regex = (self.custom_extraction_regex or "").strip()
        self.custom_extractors = list(self.custom_extractors or [])
        self.main_content_selectors = (self.main_content_selectors or "").strip()
        self.boilerplate_selectors = (self.boilerplate_selectors or "").strip()
        self.crawl_ignore_params = list(self.crawl_ignore_params or [])
        self.crawl_url_list = [
            u.strip() for u in (self.crawl_url_list or []) if u and str(u).strip()
        ]
        self.user_agent = resolve_crawl_user_agent(
            self.crawl_user_agent_preset,
            self.crawl_user_agent_custom,
            self.user_agent,
        )
        return self

    @property
    def defer_content_analysis(self) -> bool:
        return self.store_page_html and self.run_content_analysis

    @property
    def effective_concurrency(self) -> int:
        if self.render_mode == "javascript":
            return self.js_concurrency
        return max(1, int(self.concurrency))

    @property
    def follow_links(self) -> bool:
        return follow_links_for_mode(self.discovery_mode)

    @property
    def fetcher_render_mode(self) -> str:
        if self.render_mode == "javascript":
            return "javascript"
        if self.render_mode == "auto":
            return "auto"
        return "static"
