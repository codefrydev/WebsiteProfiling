"""Crawl page query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...integrations.google.page_lookup import slice_from_google_row
from ._slice import _parse_page_analysis, cap_list, parse_limit, payload_dict_slice
from .context import AuditToolContext

_PAGE_LIMIT_MAX = 30


def _page_row(rec: dict[str, Any]) -> dict[str, Any]:
    return {
        "url": str(rec.get("url") or ""),
        "status": str(rec.get("status") or ""),
        "title": str(rec.get("title") or ""),
        "inlinks": rec.get("inlinks"),
    }


def search_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}

    status_filter = str(args.get("status") or "").strip()
    url_contains = str(args.get("url_contains") or "").strip().lower()
    limit = args.get("limit", _PAGE_LIMIT_MAX)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = _PAGE_LIMIT_MAX
    limit = max(1, min(limit, _PAGE_LIMIT_MAX))

    records = df.to_dict(orient="records")
    if status_filter:
        records = [r for r in records if str(r.get("status") or "") == status_filter]
    if url_contains:
        records = [r for r in records if url_contains in str(r.get("url") or "").lower()]

    total = len(records)
    truncated = total > limit
    pages = [_page_row(r) for r in records[:limit]]
    return {"pages": pages, "total": total, "truncated": truncated}


def get_page_details(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}

    df = scoped.load_crawl_df(conn)
    crawl_row: dict[str, Any] | None = None
    if df is not None and not df.empty and "url" in df.columns:
        norm = url.rstrip("/")
        for _, row in df.iterrows():
            row_url = str(row.get("url") or "").rstrip("/")
            if row_url == norm or row_url == url:
                crawl_row = {
                    "url": row_url,
                    "status": str(row.get("status") or ""),
                    "title": str(row.get("title") or ""),
                    "meta_description": str(row.get("meta_description") or ""),
                    "h1": row.get("h1"),
                    "word_count": row.get("word_count"),
                    "inlinks": row.get("inlinks"),
                    "outlinks": row.get("outlinks"),
                    "content_type": str(row.get("content_type") or ""),
                }
                break

    payload = scoped.load_payload(conn)
    lighthouse_by_url = payload.get("lighthouse_by_url") or {}
    lh = lighthouse_by_url.get(url) or lighthouse_by_url.get(url + "/")
    if not lh and crawl_row:
        lh = lighthouse_by_url.get(crawl_row.get("url", ""))

    google_raw = scoped.load_google(conn)
    gsc_ga4 = None
    if google_raw:
        gsc_ga4 = slice_from_google_row(google_raw, url)

    return {
        "url": url,
        "crawl": crawl_row,
        "lighthouse": lh if isinstance(lh, dict) else None,
        "gsc_ga4": gsc_ga4,
        "found_in_crawl": crawl_row is not None,
    }


def get_internal_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}

    from ...db.crawl_store import read_edges

    payload = scoped.load_payload(conn)
    run_id = payload.get("crawl_run_id")
    try:
        rid = int(run_id) if run_id is not None else None
    except (TypeError, ValueError):
        rid = None

    edges = read_edges(conn, rid)
    outlinks = [b for a, b in edges if a.rstrip("/") == url]
    inlinks = [a for a, b in edges if b.rstrip("/") == url]
    limit = 50
    return {
        "url": url,
        "outlinks": outlinks[:limit],
        "inlinks": inlinks[:limit],
        "outlink_count": len(outlinks),
        "inlink_count": len(inlinks),
        "truncated": len(outlinks) > limit or len(inlinks) > limit,
    }


def list_redirects(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "redirects": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 50)
    redirects = payload.get("redirects") or []
    sliced = cap_list(redirects if isinstance(redirects, list) else [], limit, max_cap=50)
    return {"redirects": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_broken_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "broken": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 50)
    issues = payload.get("issues") or {}
    broken = issues.get("broken") if isinstance(issues, dict) else []
    sliced = cap_list(broken if isinstance(broken, list) else [], limit, max_cap=50)
    return {"broken": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_status_code_breakdown(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {
        "status_counts": payload.get("status_counts") or {},
        "summary": {
            k: (payload.get("summary") or {}).get(k)
            for k in ("total_urls", "count_2xx", "count_3xx", "count_4xx", "count_5xx", "success_rate")
        },
    }


def get_response_time_stats(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "response_time_stats")


def get_depth_distribution(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "depth_distribution")


def get_crawl_segments(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    segments = payload.get("crawl_segments")
    if not segments:
        return {"error": "crawl_segments not in report — set crawl_path_segments in config", "missing": True}
    return {"crawl_segments": segments}


def get_browser_diagnostics_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    meta = payload.get("report_meta") or {}
    browser = meta.get("browser_diagnostics") if isinstance(meta, dict) else None
    if browser:
        return {"browser_diagnostics": browser}
    return {"browser_diagnostics": None, "note": "no browser diagnostics in report_meta"}


def get_seo_health(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "seo_health")


def _status_prefix_pages(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    prefix: str,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    records = df.to_dict(orient="records")
    pages = [
        {"url": str(r.get("url") or ""), "status": str(r.get("status") or ""), "title": str(r.get("title") or "")}
        for r in records
        if str(r.get("status") or "").startswith(prefix)
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_status_4xx_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _status_prefix_pages(conn, ctx, args, "4")


def list_status_5xx_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _status_prefix_pages(conn, ctx, args, "5")


def get_page_analysis(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    for _, row in df.iterrows():
        row_url = str(row.get("url") or "").rstrip("/")
        if row_url == url or row_url == url.rstrip("/"):
            rec = row.to_dict()
            return {"url": row_url, "page_analysis": _parse_page_analysis(rec), "fetch_method": rec.get("fetch_method")}
    return {"error": "url not found in crawl", "url": url}


def search_pages_advanced(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    records = df.to_dict(orient="records")
    status_filter = str(args.get("status") or "").strip()
    url_contains = str(args.get("url_contains") or "").strip().lower()
    fetch_method = str(args.get("fetch_method") or "").strip().lower()
    noindex_only = args.get("noindex_only")
    missing_title = args.get("missing_title")
    min_word = args.get("min_word_count")
    max_word = args.get("max_word_count")

    def _truthy(val: Any) -> bool:
        return str(val or "").lower() in ("true", "1", "yes")

    def _flag(val: Any) -> bool:
        return val is True or _truthy(val)

    filtered = []
    for r in records:
        if status_filter and str(r.get("status") or "") != status_filter:
            continue
        if url_contains and url_contains not in str(r.get("url") or "").lower():
            continue
        if fetch_method and str(r.get("fetch_method") or "").lower() != fetch_method:
            continue
        if _flag(noindex_only) and not _truthy(r.get("noindex")):
            continue
        if _flag(missing_title) and str(r.get("title") or "").strip():
            continue
        wc = r.get("word_count")
        try:
            wc_val = int(wc) if wc is not None else None
        except (TypeError, ValueError):
            wc_val = None
        if min_word is not None:
            try:
                if wc_val is None or wc_val < int(min_word):
                    continue
            except (TypeError, ValueError):
                pass
        if max_word is not None:
            try:
                if wc_val is None or wc_val > int(max_word):
                    continue
            except (TypeError, ValueError):
                pass
        filtered.append({
            "url": str(r.get("url") or ""),
            "status": str(r.get("status") or ""),
            "title": str(r.get("title") or ""),
            "word_count": wc_val,
            "noindex": _truthy(r.get("noindex")),
            "fetch_method": str(r.get("fetch_method") or ""),
        })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(filtered, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_with_console_errors(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    pages = []
    for _, row in df.iterrows():
        pa = _parse_page_analysis(row.to_dict())
        errors = pa.get("console_errors") or pa.get("js_errors") or []
        if not errors:
            continue
        if isinstance(errors, str):
            errors = [errors]
        pages.append({
            "url": str(row.get("url") or ""),
            "error_count": len(errors) if isinstance(errors, list) else 1,
            "errors": (errors[:5] if isinstance(errors, list) else [errors]),
        })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_by_fetch_method(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    method = str(args.get("fetch_method") or "").strip().lower()
    if not method:
        return {"error": "fetch_method is required (e.g. static or rendered)"}
    return search_pages_advanced(conn, ctx, {**args, "fetch_method": method})


def get_crawl_links_table(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    links = payload.get("links") or []
    if not isinstance(links, list):
        links = []
    url_contains = str(args.get("url_contains") or "").strip().lower()
    if url_contains:
        links = [l for l in links if isinstance(l, dict) and url_contains in str(l.get("url") or "").lower()]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(links, limit, max_cap=100)
    return {"links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_graph_edges_sample(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "edges": [], "total": 0, "truncated": False}
    edges = payload.get("graph_edges") or []
    if not isinstance(edges, list):
        edges = []
    nodes = payload.get("graph_nodes")
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(edges, limit, max_cap=200)
    return {
        "edges": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "graph_node_count": len(nodes) if isinstance(nodes, list) else None,
    }
