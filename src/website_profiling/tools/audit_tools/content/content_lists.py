"""Content quality, optional audit, and schema list tools."""
from __future__ import annotations

import re
from typing import Any

from psycopg import Connection

from .._slice import _parse_page_analysis, _row_schema_types_list, cap_list, parse_limit, payload_dict_slice
from ..context import AuditToolContext

_ARTICLE_TYPES = frozenset({"article", "newsarticle", "blogposting", "scholarlyarticle"})
_ARTICLE_URL_HINTS = ("/blog/", "/news/", "/article/", "/post/", "/posts/")


def _optional_audit_urls(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    audit_type: str,
    *,
    item_key: str = "issues",
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", item_key: [], "total": 0, "truncated": False}
    optional = payload.get("optional_audit_urls") if isinstance(payload.get("optional_audit_urls"), dict) else {}
    items = optional.get(audit_type) or []
    if isinstance(items, list) and items:
        limit = parse_limit(args.get("limit"), 30, 50)
        sliced = cap_list(items, limit, max_cap=50)
        return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
    categories = payload.get("categories") or []
    needle = audit_type.replace("_", " ")
    issues: list[dict[str, Any]] = []
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            msg = str(issue.get("message") or "").lower()
            if audit_type == "spell" and "spell" in msg:
                issues.append(issue)
            elif audit_type == "html" and ("html" in msg or "markup" in msg):
                issues.append(issue)
            elif audit_type == "amp" and "amp" in msg:
                issues.append(issue)
            elif audit_type == "pagination" and ("pagination" in msg or "rel=prev" in msg or "rel=next" in msg):
                issues.append(issue)
            elif needle in msg:
                issues.append(issue)
    if not issues:
        return {"missing": True, item_key: [], "total": 0, "truncated": False, "note": f"enable optional {audit_type} audit in pipeline config"}
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(issues, limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_text_content_analysis(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "missing": True}
    result = payload_dict_slice(payload, "text_content_analysis")
    if result.get("missing"):
        content = payload.get("content_analytics")
        if isinstance(content, dict) and content.get("keyword_index"):
            return {"data": content, "missing": False, "note": "from content_analytics fallback"}
    return result


def list_pages_containing_keyword(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    keyword = str(args.get("keyword") or args.get("query") or "").strip().lower()
    if not keyword:
        return {"error": "keyword is required", "pages": [], "total": 0, "truncated": False}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    tca = payload.get("text_content_analysis") if isinstance(payload.get("text_content_analysis"), dict) else {}
    index = tca.get("keyword_index") or []
    pages: list[dict[str, Any]] = []
    if isinstance(index, list):
        for entry in index:
            if not isinstance(entry, dict):
                continue
            word = str(entry.get("word") or "").lower()
            if keyword not in word and word not in keyword:
                continue
            for page in entry.get("top_pages") or []:
                if isinstance(page, dict):
                    pages.append({"url": page.get("url"), "keyword": entry.get("word"), "count": page.get("count")})
                elif isinstance(page, (list, tuple)) and page:
                    pages.append({"url": page[0], "keyword": entry.get("word"), "count": page[1] if len(page) > 1 else 1})
    if not pages:
        df = scoped.load_crawl_df(conn)
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rec = row.to_dict()
                if not str(rec.get("status") or "").startswith("2"):
                    continue
                text = " ".join([
                    str(rec.get("title") or ""),
                    str(rec.get("h1") or ""),
                    str(rec.get("content_excerpt") or ""),
                ]).lower()
                if keyword in text:
                    pages.append({"url": str(rec.get("url") or ""), "keyword": keyword})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"keyword": keyword, "pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_by_word_count_band(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    try:
        raw_min = args.get("min_word_count")
        raw_max = args.get("max_word_count")
        # Use None-checks, not `or`: an explicit max_word_count of 0 is falsy and
        # would otherwise be silently replaced by the 10000 default.
        min_wc = int(raw_min) if raw_min is not None else 0
        max_wc = int(raw_max) if raw_max is not None else 10_000
    except (TypeError, ValueError):
        min_wc, max_wc = 0, 10_000
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        if min_wc <= wc <= max_wc:
            pages.append({"url": str(rec.get("url") or ""), "word_count": wc, "title": str(rec.get("title") or "")})
    pages.sort(key=lambda p: p.get("word_count", 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "band": {"min_word_count": min_wc, "max_word_count": max_wc},
    }


def list_duplicate_content_pairs(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pairs": [], "total": 0, "truncated": False}
    clusters = payload.get("content_duplicates") or []
    if not isinstance(clusters, list):
        clusters = []
    pairs: list[dict[str, Any]] = []
    for cluster in clusters:
        if not isinstance(cluster, dict):
            continue
        members = cluster.get("member_urls") or []
        if not isinstance(members, list):
            continue
        rep = str(cluster.get("representative_url") or members[0] if members else "")
        for url in members:
            u = str(url or "")
            if u and u != rep:
                pairs.append({
                    "url_a": rep,
                    "url_b": u,
                    "cluster_id": cluster.get("id"),
                    "similarity": cluster.get("similarity"),
                })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pairs, limit, max_cap=50)
    return {"pairs": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_spell_check_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _optional_audit_urls(conn, ctx, args, "spell")


def list_html_validation_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _optional_audit_urls(conn, ctx, args, "html")


def list_amp_validation_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _optional_audit_urls(conn, ctx, args, "amp")


def list_pagination_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _optional_audit_urls(conn, ctx, args, "pagination")


def list_schema_errors_by_type(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "errors": [], "total": 0, "truncated": False}
    schema_type = str(args.get("schema_type") or args.get("type") or "").strip().lower()
    validation = payload.get("rich_results_validation") or []
    if not isinstance(validation, list):
        validation = []
    errors = [
        r for r in validation
        if isinstance(r, dict) and str(r.get("status") or "").lower() != "pass"
    ]
    if schema_type:
        errors = [
            r for r in errors
            if schema_type in str(r.get("type") or r.get("schema_type") or "").lower()
        ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(errors, limit, max_cap=50)
    return {"errors": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _has_article_schema(row: dict[str, Any]) -> bool:
    types = [t.lower() for t in _row_schema_types_list(row)]
    return any(t in _ARTICLE_TYPES or "article" in t for t in types)


def list_pages_missing_article_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "").lower()
        path = url.split("://", 1)[-1]
        looks_article = any(h in path for h in _ARTICLE_URL_HINTS)
        pa = _parse_page_analysis(rec)
        types = pa.get("json_ld_types") or pa.get("schema_types") or []
        if isinstance(types, str):
            types = [types]
        if not looks_article and not any("article" in str(t).lower() for t in types):
            excerpt = str(rec.get("content_excerpt") or "")
            if len(excerpt.split()) < 200:
                continue
            looks_article = bool(re.search(r"\b(posted|published|author)\b", excerpt, re.I))
        if not looks_article or _has_article_schema(rec):
            continue
        pages.append({"url": str(rec.get("url") or ""), "title": str(rec.get("title") or ""), "reason": "article_heuristic_no_schema"})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Estimated"}
