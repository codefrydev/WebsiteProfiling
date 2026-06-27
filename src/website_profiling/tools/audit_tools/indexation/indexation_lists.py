"""Indexation, log analysis, redirect chain, and hreflang list tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....integrations.google.normalize import normalize_url, url_to_path
from ....reporting.categories import REDIRECT_CHAIN_LONG
from .._slice import _parse_page_analysis, cap_list, parse_limit
from ..context import AuditToolContext
from ..ops.ops import _load_log_analysis

_REDIRECT_CHAIN_MIN = REDIRECT_CHAIN_LONG


def _norm_path(url: str) -> str:
    try:
        return url_to_path(str(url or "")) or "/"
    except Exception:
        return str(url or "")


def _indexation_cov(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return None, {"error": "no report found", "urls": [], "total": 0, "truncated": False}
    cov = payload.get("indexation_coverage")
    if not isinstance(cov, dict):
        return payload, {
            "error": "indexation_coverage not in report",
            "missing": True,
            "urls": [],
            "total": 0,
            "truncated": False,
        }
    return payload, cov


def _cap_indexation_urls(
    urls: list[Any],
    args: dict[str, Any],
    *,
    gap_type: str = "",
    totals: dict[str, Any] | None = None,
    total_key: str = "",
) -> dict[str, Any]:
    if not isinstance(urls, list):
        urls = []
    items = [{"url": str(u)} if not isinstance(u, dict) else u for u in urls if u]
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(items, limit, max_cap=200)
    total_all = None
    if totals and total_key:
        total_all = totals.get(total_key)
    return {
        "gap_type": gap_type,
        "urls": sliced["items"],
        "total": int(total_all or sliced["total"]),
        "truncated": sliced["truncated"] or (int(total_all or 0) > limit),
    }


def list_indexation_submitted_not_indexed(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """URLs in sitemap but not successfully crawled (submitted, not indexed in crawl)."""
    _, cov = _indexation_cov(conn, ctx, args)
    if cov.get("error"):
        return cov
    assert isinstance(cov, dict)
    lists = cov.get("lists") or {}
    urls = lists.get("sitemap_only") or []
    totals = cov.get("lists_total") or {}
    return _cap_indexation_urls(urls, args, gap_type="sitemap_only", totals=totals, total_key="sitemap_only")


def list_indexation_indexed_not_submitted(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Crawled URLs not present in sitemap (found/indexable but not submitted)."""
    _, cov = _indexation_cov(conn, ctx, args)
    if cov.get("error"):
        return cov
    assert isinstance(cov, dict)
    lists = cov.get("lists") or {}
    urls = lists.get("crawled_not_in_sitemap") or []
    totals = cov.get("lists_total") or {}
    return _cap_indexation_urls(urls, args, gap_type="crawled_not_in_sitemap", totals=totals, total_key="crawled_not_in_sitemap")


def list_sitemap_urls_not_in_crawl(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    _, cov = _indexation_cov(conn, ctx, args)
    if cov.get("error"):
        return cov
    assert isinstance(cov, dict)
    lists = cov.get("lists") or {}
    urls = lists.get("sitemap_only") or []
    totals = cov.get("lists_total") or {}
    result = _cap_indexation_urls(urls, args, gap_type="sitemap_only", totals=totals, total_key="sitemap_only")
    result["source"] = "indexation_coverage.lists.sitemap_only"
    return result


def list_crawl_urls_not_in_sitemap(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    _, cov = _indexation_cov(conn, ctx, args)
    if cov.get("error"):
        return cov
    assert isinstance(cov, dict)
    lists = cov.get("lists") or {}
    urls = lists.get("crawled_not_in_sitemap") or []
    totals = cov.get("lists_total") or {}
    result = _cap_indexation_urls(urls, args, gap_type="crawled_not_in_sitemap", totals=totals, total_key="crawled_not_in_sitemap")
    result["source"] = "indexation_coverage.lists.crawled_not_in_sitemap"
    return result


def _require_log(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return None, {"error": "property_id is required", "paths": [], "total": 0, "truncated": False}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return None, {"error": "no log uploads found", "missing": True, "paths": [], "total": 0, "truncated": False}
    return row, {}


def list_log_paths_by_hits(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    row, err = _require_log(conn, ctx, args)
    if err:
        return err
    assert row is not None
    analysis = row.get("analysis") or {}
    paths = analysis.get("top_paths") or []
    if not isinstance(paths, list):
        paths = []
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(paths, limit, max_cap=100)
    return {
        "paths": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "upload_id": row.get("upload_id"),
        "filename": row.get("filename"),
    }


def list_log_5xx_paths(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    row, err = _require_log(conn, ctx, args)
    if err:
        return err
    assert row is not None
    analysis = row.get("analysis") or {}
    paths = analysis.get("paths_5xx") or []
    if not isinstance(paths, list):
        paths = []
    if not paths:
        status_counts = analysis.get("status_counts") or {}
        paths = [
            {"path": f"status_{code}", "hits": hits, "aggregate": True}
            for code, hits in status_counts.items()
            if str(code).startswith("5")
        ]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(paths, limit, max_cap=100)
    return {
        "paths": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "upload_id": row.get("upload_id"),
    }


def list_log_googlebot_low_crawl(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """High-traffic log paths with low or zero Googlebot hits (under-crawled)."""
    scoped = ctx.with_args(args)
    row, err = _require_log(conn, ctx, args)
    if err:
        return err
    assert row is not None
    analysis = row.get("analysis") or {}
    top_paths = analysis.get("top_paths") or []
    bot_paths = {
        str(r.get("path") or ""): int(r.get("hits") or 0)
        for r in (analysis.get("googlebot_paths") or [])
        if isinstance(r, dict) and r.get("path")
    }
    try:
        min_hits = int(args.get("min_hits") or 20)
        max_bot_hits = int(args.get("max_googlebot_hits") or 0)
    except (TypeError, ValueError):
        min_hits, max_bot_hits = 20, 0
    payload = scoped.load_payload(conn)
    crawl_paths: set[str] = set()
    if payload:
        for link in payload.get("links") or []:
            if isinstance(link, dict) and link.get("url"):
                crawl_paths.add(_norm_path(str(link["url"])))
    items: list[dict[str, Any]] = []
    for row_data in top_paths if isinstance(top_paths, list) else []:
        if not isinstance(row_data, dict):
            continue
        path = str(row_data.get("path") or "")
        hits = int(row_data.get("hits") or 0)
        bot_hits = bot_paths.get(path, 0)
        if hits < min_hits:
            continue
        if bot_hits > max_bot_hits:
            continue
        if path in crawl_paths and bot_hits > 0:
            continue
        items.append({
            "path": path,
            "total_hits": hits,
            "googlebot_hits": bot_hits,
            "in_crawl": path in crawl_paths,
        })
    items.sort(key=lambda x: (-x["total_hits"], x["googlebot_hits"]))
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(items, limit, max_cap=100)
    return {"paths": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_log_orphan_high_traffic(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Access-log paths with high hits that map to crawl orphan URLs."""
    scoped = ctx.with_args(args)
    row, err = _require_log(conn, ctx, args)
    if err:
        return err
    assert row is not None
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "paths": [], "total": 0, "truncated": False}
    orphan_path_set: set[str] = set()
    for url in payload.get("orphan_urls") or []:
        if not url:
            continue
        path = _norm_path(str(url))
        orphan_path_set.add(path)
    if not orphan_path_set:
        return {"paths": [], "total": 0, "truncated": False, "note": "no orphan URLs in report"}
    analysis = row.get("analysis") or {}
    top_paths = analysis.get("top_paths") or []
    try:
        min_hits = int(args.get("min_hits") or 10)
    except (TypeError, ValueError):
        min_hits = 10
    items: list[dict[str, Any]] = []
    for row_data in top_paths if isinstance(top_paths, list) else []:
        if not isinstance(row_data, dict):
            continue
        path = str(row_data.get("path") or "")
        hits = int(row_data.get("hits") or 0)
        if hits < min_hits:
            continue
        if path not in orphan_path_set:
            continue
        items.append({"path": path, "hits": hits})
    items.sort(key=lambda x: -x["hits"])
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(items, limit, max_cap=100)
    return {"paths": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_redirect_chains_by_length(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    try:
        min_length = int(args.get("min_length") or args.get("chain_length") or _REDIRECT_CHAIN_MIN)
    except (TypeError, ValueError):
        min_length = _REDIRECT_CHAIN_MIN
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        try:
            chain_len = int(rec.get("redirect_chain_length") or 0)
        except (TypeError, ValueError):
            chain_len = 0
        if chain_len < min_length:
            continue
        pages.append({
            "url": str(rec.get("url") or ""),
            "status": str(rec.get("status") or ""),
            "redirect_chain_length": chain_len,
            "final_url": str(rec.get("final_url") or ""),
        })
    pages.sort(key=lambda p: -int(p.get("redirect_chain_length") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "min_length": min_length,
    }


def list_hreflang_reciprocal_gaps(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Pages whose hreflang alternates do not link back reciprocally."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    href_map: dict[str, set[str]] = {}
    url_by_norm: dict[str, str] = {}
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "").strip()
        if not url:
            continue
        norm = normalize_url(url)
        url_by_norm[norm] = url
        pa = _parse_page_analysis(rec)
        alts = pa.get("hreflang_alternates") or []
        targets: set[str] = set()
        for alt in alts if isinstance(alts, list) else []:
            if not isinstance(alt, dict):
                continue
            href = str(alt.get("href") or "").strip()
            if href:
                targets.add(normalize_url(href))
        if targets:
            href_map[norm] = targets
    gaps: list[dict[str, Any]] = []
    for src_norm, targets in href_map.items():
        src_url = url_by_norm.get(src_norm, src_norm)
        missing_returns: list[str] = []
        for tgt_norm in targets:
            if tgt_norm == src_norm:
                continue
            tgt_targets = href_map.get(tgt_norm, set())
            if src_norm not in tgt_targets:
                missing_returns.append(url_by_norm.get(tgt_norm, tgt_norm))
        if missing_returns:
            gaps.append({
                "url": src_url,
                "missing_reciprocal_from": missing_returns[:10],
                "gap_count": len(missing_returns),
            })
    gaps.sort(key=lambda g: -int(g.get("gap_count") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(gaps, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
