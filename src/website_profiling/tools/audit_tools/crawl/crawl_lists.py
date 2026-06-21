"""Crawl-backed list tools for technical SEO, accessibility, and mobile gaps."""
from __future__ import annotations

from typing import Any, Callable

import pandas as pd
from psycopg import Connection

from ....reporting.categories import REDIRECT_CHAIN_LONG
from .._slice import _parse_page_analysis, cap_list, parse_limit
from ..context import AuditToolContext

_REDIRECT_CHAIN_MIN = REDIRECT_CHAIN_LONG


def _norm_url(url: str) -> str:
    return str(url or "").strip().rstrip("/").lower()


def _is_2xx(status: Any) -> bool:
    s = str(status or "")
    return bool(s) and s[0] == "2"


def _truthy(val: Any) -> bool:
    return str(val or "").lower() in ("true", "1", "yes")


def _success_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "status" not in df.columns:
        return df
    return df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]


def _filter_crawl_pages(
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
    work = _success_df(df) if only_2xx else df
    pages: list[dict[str, Any]] = []
    for _, row in work.iterrows():
        rec = row.to_dict()
        if predicate(rec):
            pages.append(projection(rec))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _content_urls_list(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    bucket: str,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    content_urls = payload.get("content_urls") or {}
    if not isinstance(content_urls, dict):
        return {"error": "content_urls not in report", "missing": True, "pages": [], "total": 0, "truncated": False}
    items = content_urls.get(bucket) or []
    if not isinstance(items, list):
        items = []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(items, limit, max_cap=50)
    return {"bucket": bucket, "pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_missing_canonical(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = _content_urls_list(conn, ctx, args, "missing_canonical")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: not str(r.get("canonical_url") or "").strip(),
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "status": str(r.get("status") or ""),
        },
    )


def list_canonical_mismatch(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = _content_urls_list(conn, ctx, args, "canonical_mismatch")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket

    def _mismatch(r: dict[str, Any]) -> bool:
        url = _norm_url(str(r.get("url") or ""))
        canon = _norm_url(str(r.get("canonical_url") or ""))
        return bool(url and canon and url != canon)

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_mismatch,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "canonical_url": str(r.get("canonical_url") or ""),
            "title": str(r.get("title") or ""),
        },
    )


def list_pages_with_missing_alt(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = _content_urls_list(conn, ctx, args, "missing_alt")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket

    def _missing_alt(r: dict[str, Any]) -> bool:
        try:
            return int(r.get("images_without_alt") or 0) > 0
        except (TypeError, ValueError):
            return False

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_missing_alt,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "images_without_alt": int(r.get("images_without_alt") or 0),
            "images_total": int(r.get("images_total") or 0),
        },
    )


def _heading_skipped(seq: str) -> bool:
    parts = [p.strip() for p in str(seq or "").split(",") if p.strip()]
    if not parts:
        return False
    levels: list[int] = []
    for h in parts:
        if len(h) == 2 and h[0] == "h" and h[1] in "123456":
            levels.append(int(h[1]))
    for i in range(1, len(levels)):
        if levels[i] > levels[i - 1] + 1:
            return True
    return False


def list_pages_skipped_headings(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: _heading_skipped(str(r.get("heading_sequence") or "")),
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "heading_sequence": str(r.get("heading_sequence") or ""),
            "title": str(r.get("title") or ""),
        },
    )


def list_pages_missing_viewport(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "note": "no crawl data"}
    if "viewport_present" not in df.columns:
        return {"pages": [], "total": 0, "truncated": False, "note": "viewport_present column not in crawl"}
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: not _truthy(r.get("viewport_present")),
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
        },
    )


def list_long_redirect_chains(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _long_chain(r: dict[str, Any]) -> bool:
        try:
            return int(r.get("redirect_chain_length") or 0) >= _REDIRECT_CHAIN_MIN
        except (TypeError, ValueError):
            return False

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_long_chain,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "status": str(r.get("status") or ""),
            "redirect_chain_length": int(r.get("redirect_chain_length") or 0),
        },
        only_2xx=False,
    )


def list_robots_blocked_urls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: str(r.get("status") or "") == "blocked_by_robots",
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "status": str(r.get("status") or ""),
        },
        only_2xx=False,
    )


def list_pages_missing_og_image(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if payload:
        social = payload.get("social_coverage") or {}
        if isinstance(social, dict):
            missing = social.get("og_image_missing") or []
            if isinstance(missing, list) and missing:
                limit = parse_limit(args.get("limit"), 30, 50)
                items = [{"url": str(u)} for u in missing if u]
                sliced = cap_list(items, limit, max_cap=50)
                return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: _is_2xx(r.get("status")) and not str(r.get("og_image") or "").strip(),
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "og_image": str(r.get("og_image") or ""),
            "title": str(r.get("title") or ""),
        },
    )


def get_top_pages_by_pagerank(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    candidates = payload.get("top_pages") or payload.get("links") or []
    if not isinstance(candidates, list):
        candidates = []
    ranked: list[dict[str, Any]] = []
    for rec in candidates:
        if not isinstance(rec, dict):
            continue
        pr = rec.get("pagerank")
        if pr is None:
            continue
        try:
            score = float(pr)
        except (TypeError, ValueError):
            continue
        ranked.append({
            "url": rec.get("url"),
            "pagerank": round(score, 5),
            "inlinks": rec.get("inlinks"),
            "outlinks": rec.get("outlinks"),
        })
    ranked.sort(key=lambda x: float(x.get("pagerank") or 0), reverse=True)
    sliced = cap_list(ranked, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


_SOFT_404_MARKERS = ("not found", "404", "page not found", "doesn't exist", "does not exist")


def list_pages_soft_404(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _soft(r: dict[str, Any]) -> bool:
        title = str(r.get("title") or "").lower()
        return any(m in title for m in _SOFT_404_MARKERS)

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_soft,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "status": str(r.get("status") or ""),
        },
    )


def list_pages_with_axe_violations(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _has_axe(r: dict[str, Any]) -> bool:
        pa = _parse_page_analysis(r)
        axe = pa.get("axe_violations")
        return isinstance(axe, list) and len(axe) > 0

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_has_axe,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "violation_count": len(_parse_page_analysis(r).get("axe_violations") or []),
            "title": str(r.get("title") or ""),
        },
    )


def get_axe_audit_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages_with_violations": 0, "violations_by_rule": [], "total_violations": 0}
    rule_counts: dict[str, int] = {}
    pages = 0
    total = 0
    for _, row in df.iterrows():
        pa = _parse_page_analysis(row.to_dict())
        axe = pa.get("axe_violations")
        if not isinstance(axe, list) or not axe:
            continue
        pages += 1
        for v in axe:
            if not isinstance(v, dict):
                continue
            rule = str(v.get("id") or v.get("description") or "unknown")
            rule_counts[rule] = rule_counts.get(rule, 0) + 1
            total += 1
    ranked = sorted(
        [{"rule_id": k, "count": v} for k, v in rule_counts.items()],
        key=lambda x: -x["count"],
    )[:30]
    return {
        "pages_with_violations": pages,
        "total_violations": total,
        "violations_by_rule": ranked,
        "provenance": "Crawl",
    }


def list_pages_with_mixed_content(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _mixed(r: dict[str, Any]) -> bool:
        try:
            return int(r.get("mixed_content_count") or 0) > 0
        except (TypeError, ValueError):
            return False

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_mixed,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "mixed_content_count": int(r.get("mixed_content_count") or 0),
            "title": str(r.get("title") or ""),
        },
    )


def list_dead_end_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    orphan_set = set()
    if payload:
        for u in payload.get("orphan_urls") or []:
            if u:
                orphan_set.add(_norm_url(str(u)))
    inlink_by_url: dict[str, int] = {}
    if payload:
        for rec in payload.get("top_pages") or payload.get("links") or []:
            if isinstance(rec, dict) and rec.get("url"):
                inlink_by_url[_norm_url(str(rec["url"]))] = int(rec.get("inlinks") or 0)

    def _dead_end(r: dict[str, Any]) -> bool:
        url = _norm_url(str(r.get("url") or ""))
        if not url or url in orphan_set:
            return False
        try:
            outlinks = int(r.get("outlinks") or 0)
        except (TypeError, ValueError):
            outlinks = 0
        if outlinks > 0:
            return False
        inlinks = inlink_by_url.get(url, 0)
        return inlinks > 0

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_dead_end,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "outlinks": int(r.get("outlinks") or 0),
            "title": str(r.get("title") or ""),
        },
    )


def list_duplicate_title_groups(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"groups": [], "total": 0, "truncated": False}
    work = _success_df(df)
    buckets: dict[str, list[str]] = {}
    for _, row in work.iterrows():
        title = str(row.get("title") or "").strip()
        meta = str(row.get("meta_description") or "").strip()
        if not title:
            continue
        key = f"{title}|{meta}"
        url = str(row.get("url") or "")
        if url:
            buckets.setdefault(key, []).append(url)
    groups = [
        {"title": k.split("|", 1)[0], "meta_description": k.split("|", 1)[1] if "|" in k else "", "urls": urls, "count": len(urls)}
        for k, urls in buckets.items()
        if len(urls) > 1
    ]
    groups.sort(key=lambda g: -g["count"])
    limit = parse_limit(args.get("limit"), 20, 50)
    sliced = cap_list(groups, limit, max_cap=50)
    return {"groups": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Crawl"}


def list_heavy_pages_by_bytes(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    pages: list[dict[str, Any]] = []
    for _, row in _success_df(df).iterrows():
        rec = row.to_dict()
        try:
            js = int(rec.get("total_js_bytes") or 0)
            css = int(rec.get("total_css_bytes") or 0)
            scripts = int(rec.get("script_count") or 0)
        except (TypeError, ValueError):
            continue
        total_bytes = js + css
        if total_bytes <= 0 and scripts <= 0:
            continue
        pages.append({
            "url": str(rec.get("url") or ""),
            "total_js_bytes": js,
            "total_css_bytes": css,
            "script_count": scripts,
            "total_asset_bytes": total_bytes,
            "title": str(rec.get("title") or ""),
        })
    pages.sort(key=lambda p: -int(p.get("total_asset_bytes") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Crawl"}


def list_pages_poor_cache_headers(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    def _poor_cache(r: dict[str, Any]) -> bool:
        cache = str(r.get("cache_control") or "").strip().lower()
        etag = str(r.get("etag") or "").strip()
        if not cache and not etag:
            return True
        if cache in ("no-cache", "no-store") and not etag:
            return True
        return False

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_poor_cache,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "cache_control": str(r.get("cache_control") or ""),
            "etag": str(r.get("etag") or ""),
            "title": str(r.get("title") or ""),
        },
    )


def list_pages_low_content_ratio(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        threshold = float(args.get("max_content_html_ratio", 15))
    except (TypeError, ValueError):
        threshold = 15.0

    def _low_ratio(r: dict[str, Any]) -> bool:
        try:
            ratio = float(r.get("content_html_ratio") or 0)
        except (TypeError, ValueError):
            return False
        return 0 < ratio < threshold

    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=_low_ratio,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "content_html_ratio": r.get("content_html_ratio"),
            "word_count": r.get("word_count"),
            "title": str(r.get("title") or ""),
        },
    )


def get_heading_outline_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    needle = url.rstrip("/").lower()
    for _, row in df.iterrows():
        row_url = str(row.get("url") or "").rstrip("/").lower()
        if row_url != needle:
            continue
        rec = row.to_dict()
        pa = _parse_page_analysis(rec)
        return {
            "url": str(rec.get("url") or ""),
            "heading_sequence": str(rec.get("heading_sequence") or ""),
            "heading_text": str(rec.get("heading_text") or ""),
            "headings": pa.get("headings") if isinstance(pa.get("headings"), list) else [],
            "provenance": "Crawl",
        }
    return {"error": "url not found in crawl", "url": url}
