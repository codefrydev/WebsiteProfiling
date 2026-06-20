"""Per-URL ``links`` list for the report payload (Link Explorer / On-Page views).

Extracted verbatim from ``reporting/builder.py``. Builds one record per crawled
URL with SEO, accessibility, asset, caching, security-header, content and
social/OG signals, plus Lighthouse and ML enrichment overlays.
"""
from __future__ import annotations

import json
from typing import Any

import pandas as pd

from ...crawl.fetchers.browser_diagnostics import browser_summary_from_page_analysis
from ..lighthouse_report import lighthouse_for_url


def build_links_list(
    df: pd.DataFrame,
    in_degree: dict[str, int],
    lighthouse_by_url: dict[str, Any] | None,
    ml_bundle: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build the full ``links`` payload slice: every crawled URL with its signals."""
    dup_gid = ml_bundle.get("url_duplicate_group_id") or {}
    sim_map = ml_bundle.get("similar_internal_by_url") or {}
    lang_map = ml_bundle.get("language_by_url") or {}
    spacy_map = ml_bundle.get("spacy_by_url") or {}
    kp_map = ml_bundle.get("keyphrases_by_url") or {}

    links = []
    for _, row in df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        u = str(u).strip()
        st = str(row.get("status", "")).strip()
        title_val = row.get("title")
        title_str = "" if pd.isna(title_val) else str(title_val).strip()
        content_len = row.get("content_length")
        if "content_length" in df.columns and content_len is not None and not pd.isna(content_len):
            content_len = int(pd.to_numeric(content_len, errors="coerce") or 0)
        else:
            content_len = 0
        depth_val = row.get("depth") if "depth" in df.columns else None
        depth_int = None
        if depth_val is not None and not pd.isna(depth_val):
            try:
                depth_int = int(pd.to_numeric(depth_val, errors="coerce") or 0)
            except Exception:
                depth_int = None
        wc_val = row.get("word_count") if "word_count" in df.columns else 0
        wc_int = 0
        if wc_val is not None and not pd.isna(wc_val):
            try:
                wc_int = int(pd.to_numeric(wc_val, errors="coerce") or 0)
            except Exception:
                wc_int = 0
        rt_val = row.get("response_time_ms") if "response_time_ms" in df.columns else 0
        rt_int = 0
        if rt_val is not None and not pd.isna(rt_val):
            try:
                rt_int = int(pd.to_numeric(rt_val, errors="coerce") or 0)
            except Exception:
                rt_int = 0
        rec = {
            "url": u,
            "status": st,
            "inlinks": in_degree.get(u, 0),
            "title": title_str,
            "content_length": content_len,
            "word_count": wc_int,
            "response_time_ms": rt_int,
        }
        if depth_int is not None:
            rec["depth"] = depth_int

        def _int_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return 0
            try:
                return int(pd.to_numeric(v, errors="coerce") or 0)
            except Exception:
                return 0

        def _str_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return ""
            return str(v).strip()

        def _bool_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return False
            return bool(v)

        # Navigation / crawl basics
        rec["outlinks"] = _int_col("outlinks")
        rec["content_type"] = _str_col("content_type")
        rec["redirect_chain_length"] = _int_col("redirect_chain_length")

        # SEO signals
        rec["meta_description"] = _str_col("meta_description")
        rec["meta_description_len"] = _int_col("meta_description_len")
        rec["h1"] = _str_col("h1")
        rec["h1_count"] = _int_col("h1_count")
        rec["canonical_url"] = _str_col("canonical_url")
        rec["noindex"] = _bool_col("noindex")
        rec["has_schema"] = _bool_col("has_schema")
        rec["viewport_present"] = _bool_col("viewport_present")
        rec["heading_sequence"] = _str_col("heading_sequence")

        # Images & accessibility
        rec["images_total"] = _int_col("images_total")
        rec["images_without_alt"] = _int_col("images_without_alt")
        rec["img_without_lazy"] = _int_col("img_without_lazy")
        rec["img_without_dimensions"] = _int_col("img_without_dimensions")
        rec["aria_count"] = _int_col("aria_count")
        rec["mixed_content_count"] = _int_col("mixed_content_count")

        # Assets
        rec["script_count"] = _int_col("script_count")
        rec["link_stylesheet_count"] = _int_col("link_stylesheet_count")

        # Caching
        rec["cache_control"] = _str_col("cache_control")
        rec["etag"] = _str_col("etag")

        # Security headers
        rec["strict_transport_security"] = _str_col("strict_transport_security")
        rec["x_content_type_options"] = _str_col("x_content_type_options")
        rec["x_frame_options"] = _str_col("x_frame_options")
        rec["content_security_policy"] = _str_col("content_security_policy")

        # Content analysis
        # NaN is truthy, so `pd.to_numeric(...) or 0.0` does NOT fall back; guard with pd.isna.
        _rl_num = pd.to_numeric(row.get("reading_level") if "reading_level" in df.columns else None, errors="coerce")
        rec["reading_level"] = round(float(0.0 if pd.isna(_rl_num) else _rl_num), 1)
        _chr_num = pd.to_numeric(row.get("content_html_ratio") if "content_html_ratio" in df.columns else None, errors="coerce")
        rec["content_html_ratio"] = round(float(0.0 if pd.isna(_chr_num) else _chr_num), 2)
        rec["top_keywords"] = _str_col("top_keywords")
        rec["content_excerpt"] = _str_col("content_excerpt") if "content_excerpt" in df.columns else ""

        # Social / OG
        rec["og_title"] = _str_col("og_title")
        rec["og_description"] = _str_col("og_description")
        rec["og_image"] = _str_col("og_image")
        rec["og_type"] = _str_col("og_type")
        rec["twitter_card"] = _str_col("twitter_card")
        rec["twitter_title"] = _str_col("twitter_title")
        rec["twitter_image"] = _str_col("twitter_image")

        # Tech stack
        rec["tech_stack"] = _str_col("tech_stack")

        # Custom extraction (regex + XPath/CSS extractors)
        rec["custom_extract"] = _str_col("custom_extract")
        rec["custom_fields"] = _str_col("custom_fields")

        pa_obj: dict[str, Any] = {}
        if "page_analysis" in df.columns:
            raw_pa = row.get("page_analysis")
            if raw_pa is not None and not (isinstance(raw_pa, float) and pd.isna(raw_pa)):
                s = str(raw_pa).strip()
                if s and s != "{}":
                    try:
                        pa_obj = json.loads(s)
                    except json.JSONDecodeError:
                        pa_obj = {}
        if not isinstance(pa_obj, dict):
            pa_obj = {}
        rec["page_analysis"] = pa_obj
        rec["internal_link_count"] = int(pa_obj.get("internal_link_count") or 0)
        rec["external_link_count"] = int(pa_obj.get("external_link_count") or 0)

        browser_counts = browser_summary_from_page_analysis(pa_obj)
        rec["console_error_count"] = browser_counts["console_error_count"]
        rec["page_error_count"] = browser_counts["page_error_count"]
        rec["has_browser_errors"] = (
            browser_counts["console_error_count"] > 0 or browser_counts["page_error_count"] > 0
        )

        rec["lighthouse"] = lighthouse_for_url(lighthouse_by_url or {}, u)

        uk = u.rstrip("/")
        if isinstance(rec["page_analysis"], dict):
            if uk in lang_map:
                rec["page_analysis"].setdefault("signals", {})["language"] = lang_map[uk]
            if uk in spacy_map:
                rec["page_analysis"].setdefault("signals", {})["nlp_entities"] = spacy_map[uk]
        if uk in dup_gid:
            rec["duplicate_group_id"] = dup_gid[uk]
        nei = sim_map.get(uk) or sim_map.get(u)
        if nei:
            rec["similar_internal"] = list(nei)
        if uk in lang_map:
            rec["detected_language"] = lang_map[uk]
        if uk in spacy_map:
            rec["nlp_entities"] = spacy_map[uk]
        if uk in kp_map:
            rec["keyphrases"] = kp_map[uk]

        links.append(rec)

    return links
