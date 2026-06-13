"""Link graph list tools from payload link_edges, graph_edges, and PageRank."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from psycopg import Connection

from ._slice import cap_list, parse_limit
from .context import AuditToolContext


def _norm_url(url: str) -> str:
    return str(url or "").strip().rstrip("/").lower()


def _load_link_edges(payload: dict[str, Any]) -> list[dict[str, Any]]:
    edges = payload.get("link_edges") or []
    if isinstance(edges, list) and edges:
        return [e for e in edges if isinstance(e, dict)]
    graph = payload.get("graph_edges") or []
    if not isinstance(graph, list):
        return []
    converted: list[dict[str, Any]] = []
    for edge in graph:
        if isinstance(edge, dict):
            converted.append({
                "from_url": edge.get("from") or edge.get("source") or edge.get("from_url"),
                "to_url": edge.get("to") or edge.get("target") or edge.get("to_url"),
                "link_type": edge.get("link_type") or "internal",
                "is_nofollow": bool(edge.get("is_nofollow")),
                "rel": edge.get("rel"),
                "anchor_text": edge.get("anchor_text") or edge.get("label"),
            })
        elif isinstance(edge, (list, tuple)) and len(edge) >= 2:
            converted.append({
                "from_url": edge[0],
                "to_url": edge[1],
                "link_type": "internal",
                "is_nofollow": False,
            })
    return converted


def _pagerank_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = payload.get("top_pages") or payload.get("links") or []
    if not isinstance(candidates, list):
        return []
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
    ranked.sort(key=lambda x: float(x.get("pagerank") or 0))
    return ranked


def list_outbound_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 100)
    edges = _load_link_edges(payload)
    items = [
        {
            "from_url": e.get("from_url"),
            "to_url": e.get("to_url"),
            "anchor_text": e.get("anchor_text"),
            "rel": e.get("rel"),
            "is_nofollow": bool(e.get("is_nofollow")),
        }
        for e in edges
        if str(e.get("link_type") or "") == "external"
    ]
    if not items:
        start = str(payload.get("start_url") or payload.get("origin") or "").strip()
        origin_host = urlparse(start).netloc.lower().lstrip("www.") if start else ""
        for e in edges:
            to_url = str(e.get("to_url") or "")
            host = urlparse(to_url).netloc.lower().lstrip("www.")
            if origin_host and host and host != origin_host:
                items.append({
                    "from_url": e.get("from_url"),
                    "to_url": to_url,
                    "anchor_text": e.get("anchor_text"),
                    "rel": e.get("rel"),
                    "is_nofollow": bool(e.get("is_nofollow")),
                })
    sliced = cap_list(items, limit, max_cap=100)
    return {"links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_internal_links_from_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    source = str(args.get("url") or args.get("from_url") or "").strip()
    if not source:
        return {"error": "url is required", "links": [], "total": 0, "truncated": False}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    needle = _norm_url(source)
    limit = parse_limit(args.get("limit"), 30, 100)
    edges = _load_link_edges(payload)
    items = [
        {
            "from_url": e.get("from_url"),
            "to_url": e.get("to_url"),
            "anchor_text": e.get("anchor_text"),
            "rel": e.get("rel"),
            "is_nofollow": bool(e.get("is_nofollow")),
        }
        for e in edges
        if _norm_url(str(e.get("from_url") or "")) == needle
        and str(e.get("link_type") or "internal") == "internal"
    ]
    sliced = cap_list(items, limit, max_cap=100)
    return {"url": source, "links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_internal_links_to_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    target = str(args.get("url") or args.get("to_url") or args.get("target_url") or "").strip()
    if not target:
        return {"error": "url is required", "links": [], "total": 0, "truncated": False}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    needle = _norm_url(target)
    limit = parse_limit(args.get("limit"), 30, 100)
    edges = _load_link_edges(payload)
    items = [
        {
            "from_url": e.get("from_url"),
            "to_url": e.get("to_url"),
            "anchor_text": e.get("anchor_text"),
            "rel": e.get("rel"),
            "is_nofollow": bool(e.get("is_nofollow")),
        }
        for e in edges
        if _norm_url(str(e.get("to_url") or "")) == needle
        and str(e.get("link_type") or "internal") == "internal"
    ]
    sliced = cap_list(items, limit, max_cap=100)
    return {"url": target, "links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_links_by_rel_nofollow(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 100)
    rel_filter = str(args.get("rel") or "nofollow").strip().lower()
    edges = _load_link_edges(payload)
    items = []
    for e in edges:
        rel = str(e.get("rel") or "").lower()
        is_nf = bool(e.get("is_nofollow"))
        if rel_filter == "nofollow" and not is_nf and "nofollow" not in rel:
            continue
        if rel_filter not in ("nofollow", "") and rel_filter not in rel:
            continue
        items.append({
            "from_url": e.get("from_url"),
            "to_url": e.get("to_url"),
            "link_type": e.get("link_type"),
            "rel": e.get("rel"),
            "is_nofollow": is_nf,
            "anchor_text": e.get("anchor_text"),
        })
    sliced = cap_list(items, limit, max_cap=100)
    return {"links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "rel_filter": rel_filter}


def list_pagerank_low_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    try:
        max_pr = float(args.get("max_pagerank", 0.01))
    except (TypeError, ValueError):
        max_pr = 0.01
    ranked = _pagerank_rows(payload)
    if not ranked:
        return {"missing": True, "pages": [], "total": 0, "truncated": False, "note": "pagerank not in report"}
    low = [r for r in ranked if float(r.get("pagerank") or 0) <= max_pr]
    sliced = cap_list(low, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "max_pagerank": max_pr,
    }
