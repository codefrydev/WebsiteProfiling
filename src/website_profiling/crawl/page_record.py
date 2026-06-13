"""Build crawl page records from fetched HTML."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from ..analysis.page import analyze_html
from ..common import (
    detect_tech_wappalyzer,
    parse_content_text,
    parse_link_edges,
    parse_resources,
    parse_seo,
    parse_seo_extended,
    parse_social_meta,
    parse_tech_stack,
)
from .extraction import run_extractors
from .fetchers.base import FetchResult
from .fetchers.browser_diagnostics import merge_browser_into_page_analysis
from .fetchers.hybrid import HybridFetcher
from .fetchers.spa_heuristics import needs_js_render_after_parse
from .schema import empty_crawl_row, empty_crawl_row_ext


class PageRecordBuilder:
    """Extract SEO/content fields and assemble crawl result rows."""

    def __init__(
        self,
        *,
        use_wappalyzer: bool = True,
        store_content_excerpt: bool = False,
        content_excerpt_max_chars: int = 4096,
        defer_content_analysis: bool = False,
        custom_extraction_regex: str = "",
        custom_extractors: Optional[list[dict]] = None,
    ) -> None:
        self.use_wappalyzer = use_wappalyzer
        self.store_content_excerpt = store_content_excerpt
        self.content_excerpt_max_chars = content_excerpt_max_chars
        self.defer_content_analysis = defer_content_analysis
        self.custom_extraction_regex = custom_extraction_regex
        self.custom_extractors = list(custom_extractors or [])
        self._wappalyzer_instance = None

    def empty_ext(
        self,
        url: str,
        headers_dict: Optional[dict] = None,
        redirect_chain_length: int = 0,
    ) -> dict[str, Any]:
        return empty_crawl_row_ext(url, headers_dict, redirect_chain_length)

    def parse_page_content(
        self,
        url: str,
        text: str,
        final_url: str,
        headers_dict: dict,
        redirect_chain_length: int,
    ) -> dict[str, Any]:
        """Extract title, links, and SEO/content fields from HTML."""
        ext = self.empty_ext(url, headers_dict, redirect_chain_length)
        title, link_edge_rows = parse_link_edges(url, text)
        links = {e["to_url"] for e in link_edge_rows}
        meta_description, meta_description_len, h1_text, h1_count, canonical_url = parse_seo(
            url, text
        )
        seo_ext = parse_seo_extended(text, final_url or url)
        ext["viewport_present"] = seo_ext.get("viewport_present", False)
        ext["viewport_content"] = seo_ext.get("viewport_content", "")
        ext["noindex"] = seo_ext.get("noindex", False)
        if (headers_dict.get("X-Robots-Tag") or "").lower().find("noindex") >= 0:
            ext["noindex"] = True
        ext["has_schema"] = seo_ext.get("has_schema", False)
        ext["heading_sequence"] = ",".join(seo_ext.get("heading_sequence") or [])
        ext["heading_text"] = " | ".join(seo_ext.get("heading_text") or [])
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
        if not self.defer_content_analysis:
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

    def apply_custom_extractions(self, ext: dict[str, Any], text: Optional[str]) -> None:
        if self.custom_extraction_regex and text:
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

    @staticmethod
    def maybe_refetch_after_parse(
        url: str,
        result: FetchResult,
        *,
        render_mode: str,
        hybrid_fetcher: Optional[HybridFetcher],
        link_count: int,
        same_domain_link_count: int,
    ) -> FetchResult:
        """Post-parse auto-mode fallback when static HTML has too few links."""
        if render_mode != "auto" or hybrid_fetcher is None:
            return result
        if result.fetch_method != "static":
            return result
        if not needs_js_render_after_parse(
            result,
            link_count=link_count,
            same_domain_link_count=same_domain_link_count,
        ):
            return result
        rendered = hybrid_fetcher.refetch_rendered(url)
        if rendered.status == 200 and rendered.text:
            return rendered
        return result

    @staticmethod
    def sync_from_fetch_result(
        result: FetchResult,
        url: str,
        *,
        content_length: int,
        headers_dict: dict,
    ) -> dict[str, Any]:
        """Copy FetchResult fields after a post-parse browser refetch."""
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

    @staticmethod
    def build_robots_blocked_row(url: str, *, store_outlinks: bool) -> dict[str, Any]:
        row = empty_crawl_row(
            url=url,
            status="blocked_by_robots",
            fetch_method="static",
        )
        if store_outlinks:
            row["outlink_targets"] = "[]"
        return row

    @staticmethod
    def build_fetch_error_row(
        url: str,
        result: FetchResult,
        *,
        fetch_method: str,
        store_outlinks: bool,
    ) -> dict[str, Any]:
        row = empty_crawl_row(
            url=url,
            status="error",
            fetch_method=fetch_method,
            headers_dict=result.headers_dict or {},
            redirect_chain_length=result.redirect_chain_length,
        )
        if store_outlinks:
            row["outlink_targets"] = "[]"
        if result.browser_diagnostics:
            row["page_analysis"] = merge_browser_into_page_analysis(
                None, result.browser_diagnostics
            )
        return row

    @staticmethod
    def merge_browser_diagnostics(ext: dict[str, Any], result: FetchResult) -> None:
        if result.browser_diagnostics:
            ext["page_analysis"] = merge_browser_into_page_analysis(
                ext.get("page_analysis"), result.browser_diagnostics
            )
