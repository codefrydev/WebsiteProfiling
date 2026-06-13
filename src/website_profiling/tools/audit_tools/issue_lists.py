"""Issue and gap list tools from report payload buckets and crawl columns."""
from __future__ import annotations

from collections import Counter
from typing import Any, Callable

import pandas as pd
from psycopg import Connection

from ...reporting.categories._helpers import (
    RESPONSE_TIME_SLOW_MS,
    TITLE_LEN_MAX,
    TITLE_LEN_MIN,
    _hreflang_issues,
    _orphan_hub_suggestions,
)
from ...reporting.categories.accessibility import contrast_issues_from_sources
from ._slice import _parse_page_analysis, _row_schema_types_list, cap_list, parse_limit
from .context import AuditToolContext

_READING_LEVEL_HIGH = 12.0
_VERY_THIN_WORDS = 100


def _payload_url_bucket(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    bucket: str,
    *,
    item_key: str = "pages",
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", item_key: [], "total": 0, "truncated": False}
    content_urls = payload.get("content_urls") or {}
    if not isinstance(content_urls, dict):
        return {"error": "content_urls not in report", "missing": True, item_key: [], "total": 0, "truncated": False}
    items = content_urls.get(bucket) or []
    if not isinstance(items, list):
        items = []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(items, limit, max_cap=50)
    return {
        "bucket": bucket,
        item_key: sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def _payload_list_key(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    key: str,
    *,
    item_key: str = "pages",
    nested: str = "",
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", item_key: [], "total": 0, "truncated": False}
    raw = payload.get(key)
    if nested and isinstance(raw, dict):
        items = raw.get(nested) or []
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    if not items:
        return {"missing": True, item_key: [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(items if isinstance(items, list) else [], limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _filter_crawl_df(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    *,
    predicate: Callable[[dict[str, Any]], bool],
    projection: Callable[[dict[str, Any]], dict[str, Any]],
    only_2xx: bool = True,
    item_key: str = "pages",
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {item_key: [], "total": 0, "truncated": False}
    work = df
    if only_2xx and "status" in df.columns:
        work = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
    pages: list[dict[str, Any]] = []
    for _, row in work.iterrows():
        rec = row.to_dict()
        if predicate(rec):
            pages.append(projection(rec))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _issues_by_type(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    issue_type: str,
    *,
    item_key: str = "issues",
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", item_key: [], "total": 0, "truncated": False}
    issues_root = payload.get("issues") or {}
    seo = issues_root.get("seo") if isinstance(issues_root, dict) else []
    if not isinstance(seo, list):
        seo = []
    needle = issue_type.strip().lower()
    filtered = [
        x for x in seo
        if isinstance(x, dict) and str(x.get("type") or "").lower() == needle
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(filtered, limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _bucket_or_crawl(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    bucket: str,
    *,
    predicate: Callable[[dict[str, Any]], bool],
    projection: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    result = _payload_url_bucket(conn, ctx, args, bucket)
    if result.get("total", 0) > 0 or result.get("missing"):
        return result
    return _filter_crawl_df(conn, ctx, args, predicate=predicate, projection=projection)


def list_pages_title_too_short(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _short(r: dict[str, Any]) -> bool:
        try:
            tl = int(r.get("title_length") or 0)
        except (TypeError, ValueError):
            tl = 0
        return tl > 0 and tl < TITLE_LEN_MIN

    return _bucket_or_crawl(
        conn, ctx, args, "title_short",
        predicate=_short,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "title_length": int(r.get("title_length") or 0),
        },
    )


def list_pages_title_too_long(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _long(r: dict[str, Any]) -> bool:
        try:
            tl = int(r.get("title_length") or 0)
        except (TypeError, ValueError):
            tl = 0
        return tl > TITLE_LEN_MAX

    return _bucket_or_crawl(
        conn, ctx, args, "title_long",
        predicate=_long,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "title_length": int(r.get("title_length") or 0),
        },
    )


def list_pages_slow_response(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        threshold = int(args.get("threshold_ms") or RESPONSE_TIME_SLOW_MS)
    except (TypeError, ValueError):
        threshold = RESPONSE_TIME_SLOW_MS

    def _slow(r: dict[str, Any]) -> bool:
        try:
            ms = float(r.get("response_time_ms") or 0)
        except (TypeError, ValueError):
            ms = 0
        return ms >= threshold

    return _bucket_or_crawl(
        conn, ctx, args, "slow_response",
        predicate=_slow,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "response_time_ms": float(r.get("response_time_ms") or 0),
            "status": str(r.get("status") or ""),
        },
    )


def list_pages_missing_html_lang(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _missing(r: dict[str, Any]) -> bool:
        pa = _parse_page_analysis(r)
        return not str(pa.get("html_lang") or "").strip()

    return _bucket_or_crawl(
        conn, ctx, args, "missing_html_lang",
        predicate=_missing,
        projection=lambda r: {"url": str(r.get("url") or ""), "title": str(r.get("title") or "")},
    )


def list_pages_invalid_viewport(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _truthy(val: Any) -> bool:
        return str(val or "").lower() in ("true", "1", "yes")

    def _invalid(r: dict[str, Any]) -> bool:
        if not _truthy(r.get("viewport_present")):
            return False
        content = str(r.get("viewport_content") or "").strip()
        return not content or "width" not in content.lower() and "device-width" not in content.lower()

    bucket = _payload_url_bucket(conn, ctx, args, "invalid_viewport")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket
    return _filter_crawl_df(conn, ctx, args, predicate=_invalid, projection=lambda r: {
        "url": str(r.get("url") or ""),
        "viewport_content": str(r.get("viewport_content") or ""),
    })


def list_pages_color_contrast_failures(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    df = scoped.load_crawl_df(conn)
    lh = payload.get("lighthouse_by_url") if isinstance(payload.get("lighthouse_by_url"), dict) else {}
    issues = contrast_issues_from_sources(df if df is not None else pd.DataFrame(), lh)
    pages = [
        {"url": str(i.get("url") or ""), "message": str(i.get("message") or "")}
        for i in issues if isinstance(i, dict) and i.get("url")
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_high_reading_level(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        min_grade = float(args.get("min_reading_level") or _READING_LEVEL_HIGH)
    except (TypeError, ValueError):
        min_grade = _READING_LEVEL_HIGH

    def _high(r: dict[str, Any]) -> bool:
        try:
            lvl = float(r.get("reading_level") or 0)
        except (TypeError, ValueError):
            lvl = 0
        return lvl >= min_grade

    return _bucket_or_crawl(
        conn, ctx, args, "high_reading_level",
        predicate=_high,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "reading_level": float(r.get("reading_level") or 0),
            "title": str(r.get("title") or ""),
        },
    )


def list_pages_very_thin_content(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        max_words = int(args.get("max_word_count") or _VERY_THIN_WORDS)
    except (TypeError, ValueError):
        max_words = _VERY_THIN_WORDS

    def _thin(r: dict[str, Any]) -> bool:
        try:
            wc = int(r.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        return 0 < wc < max_words

    bucket = _payload_url_bucket(conn, ctx, args, "very_thin_content")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket
    return _filter_crawl_df(
        conn, ctx, args,
        predicate=_thin,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "word_count": int(r.get("word_count") or 0),
        },
    )


def list_hreflang_issue_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    payload_result = _payload_list_key(conn, ctx, args, "hreflang_issue_urls")
    if payload_result.get("total", 0) > 0:
        return payload_result
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    issues = _hreflang_issues(success)
    pages = [{"url": str(i.get("url") or ""), "message": str(i.get("message") or "")} for i in issues]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_missing_og_tags(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    social = payload.get("social_coverage") if isinstance(payload.get("social_coverage"), dict) else {}
    urls = social.get("missing_og") or []
    if isinstance(urls, list) and urls:
        limit = parse_limit(args.get("limit"), 30, 50)
        pages = [{"url": str(u)} for u in urls if u]
        sliced = cap_list(pages, limit, max_cap=50)
        return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
    return _filter_crawl_df(
        conn, ctx, args,
        predicate=lambda r: not str(r.get("og_title") or "").strip(),
        projection=lambda r: {"url": str(r.get("url") or ""), "title": str(r.get("title") or "")},
    )


def list_pages_missing_twitter_cards(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    social = payload.get("social_coverage") if isinstance(payload.get("social_coverage"), dict) else {}
    urls = social.get("missing_twitter") or []
    if isinstance(urls, list) and urls:
        limit = parse_limit(args.get("limit"), 30, 50)
        pages = [{"url": str(u)} for u in urls if u]
        sliced = cap_list(pages, limit, max_cap=50)
        return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
    return _filter_crawl_df(
        conn, ctx, args,
        predicate=lambda r: not str(r.get("twitter_card") or "").strip(),
        projection=lambda r: {"url": str(r.get("url") or ""), "title": str(r.get("title") or "")},
    )


def list_pages_invalid_json_ld(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _invalid(r: dict[str, Any]) -> bool:
        has_schema = str(r.get("has_schema") or "").lower() in ("true", "1", "yes")
        types = _row_schema_types_list(r)
        return has_schema and not types

    return _filter_crawl_df(
        conn, ctx, args,
        predicate=_invalid,
        projection=lambda r: {"url": str(r.get("url") or ""), "title": str(r.get("title") or "")},
    )


def list_pages_mixed_language(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    lang_summary = payload.get("language_summary") if isinstance(payload.get("language_summary"), dict) else {}
    counts = lang_summary.get("counts") if isinstance(lang_summary.get("counts"), dict) else {}
    if counts:
        dominant = max(counts.items(), key=lambda x: x[1])[0]
    else:
        dominant = ""
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        lang = str(rec.get("detected_language") or rec.get("language") or "").strip().lower()
        if not lang or not dominant:
            continue
        if lang != str(dominant).lower():
            pages.append({
                "url": str(rec.get("url") or ""),
                "language": lang,
                "dominant_language": dominant,
            })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_orphan_hub_suggestions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "suggestions": [], "total": 0, "truncated": False}
    orphans = payload.get("orphan_urls") or []
    if not isinstance(orphans, list):
        orphans = []
    edges_raw = payload.get("graph_edges") or []
    edges: list[tuple[str, str]] = []
    nodes = payload.get("graph_nodes") or []
    node_urls: dict[int, str] = {}
    if isinstance(nodes, list):
        for i, n in enumerate(nodes):
            if isinstance(n, dict):
                node_urls[i] = str(n.get("url") or n.get("id") or "")
            elif isinstance(n, str):
                node_urls[i] = n
    for e in edges_raw:
        if isinstance(e, (list, tuple)) and len(e) >= 2:
            src = node_urls.get(int(e[0]), str(e[0]))
            tgt = node_urls.get(int(e[1]), str(e[1]))
            if src and tgt:
                edges.append((src, tgt))
        elif isinstance(e, dict):
            src = str(e.get("source") or e.get("from") or "")
            tgt = str(e.get("target") or e.get("to") or "")
            if src and tgt:
                edges.append((src, tgt))
    issues = _orphan_hub_suggestions(edges, [str(u) for u in orphans if u])
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(issues, limit, max_cap=50)
    return {"suggestions": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _lighthouse_failure_bucket(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    metric: str,
) -> dict[str, Any]:
    payload_result = _payload_list_key(
        conn, ctx, args, "lighthouse_failure_urls", nested=metric, item_key="pages",
    )
    if payload_result.get("total", 0) > 0:
        return payload_result
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    lh_by_url = payload.get("lighthouse_by_url") if isinstance(payload.get("lighthouse_by_url"), dict) else {}
    pages: list[dict[str, Any]] = []
    metric_key = metric.lower()
    for url, summary in lh_by_url.items():
        if not isinstance(summary, dict):
            continue
        audits = summary.get("audits") if isinstance(summary.get("audits"), dict) else {}
        score_val = summary.get(metric_key) or summary.get(metric.upper())
        failed = False
        if metric_key in ("lcp", "inp", "cls"):
            try:
                failed = float(score_val or 0) > 0 and metric_key in str(summary.get("cwv_failures") or "").lower()
            except (TypeError, ValueError):
                failed = False
            if not failed:
                for fail in summary.get("top_failures") or []:
                    if isinstance(fail, dict) and metric_key in str(fail.get("id") or "").lower():
                        failed = True
                        break
        elif metric_key == "seo":
            try:
                failed = float(summary.get("seo") or 100) < 70
            except (TypeError, ValueError):
                failed = False
        if failed or (metric_key == "seo" and isinstance(score_val, (int, float)) and float(score_val) < 70):
            pages.append({"url": str(url), "lighthouse": {metric: score_val}})
        elif metric_key in audits and isinstance(audits[metric_key], dict):
            audit = audits[metric_key]
            if audit.get("score") is not None and float(audit.get("score") or 1) < 0.9:
                pages.append({"url": str(url), "audit": audit.get("title") or metric})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_lighthouse_failure_lcp(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _lighthouse_failure_bucket(conn, ctx, args, "lcp")


def list_lighthouse_failure_inp(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _lighthouse_failure_bucket(conn, ctx, args, "inp")


def list_lighthouse_failure_cls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _lighthouse_failure_bucket(conn, ctx, args, "cls")


def list_lighthouse_failure_seo(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    try:
        threshold = int(args.get("seo_threshold") or 70)
    except (TypeError, ValueError):
        threshold = 70
    lh_by_url = payload.get("lighthouse_by_url") if isinstance(payload.get("lighthouse_by_url"), dict) else {}
    pages: list[dict[str, Any]] = []
    for url, summary in lh_by_url.items():
        if not isinstance(summary, dict):
            continue
        try:
            seo = float(summary.get("seo") or 100)
        except (TypeError, ValueError):
            seo = 100
        if seo < threshold:
            pages.append({"url": str(url), "seo_score": seo})
    pages.sort(key=lambda p: float(p.get("seo_score") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
