"""Backlink list tools from GSC Links import data."""
from __future__ import annotations

from collections import Counter
from typing import Any
from urllib.parse import urlparse

from psycopg import Connection

from ....common import strip_www_prefix
from .._slice import cap_list, parse_limit
from ..context import AuditToolContext


def _load_links(scoped: AuditToolContext, conn: Connection) -> dict[str, Any] | None:
    if scoped.property_id is None:
        return None
    return scoped.load_gsc_links(conn)


def _all_link_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for key in ("sample_links", "latest_links"):
        chunk = data.get(key) or []
        if isinstance(chunk, list):
            rows.extend([r for r in chunk if isinstance(r, dict)])
    return rows


def _norm_domain(url: str) -> str:
    try:
        host = urlparse(str(url or "")).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return str(url or "").lower()


def list_referring_domains(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "domains": [], "total": 0, "truncated": False}
    data = _load_links(scoped, conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "domains": [], "total": 0, "truncated": False}
    domains = list(data.get("top_linking_sites") or [])
    if not domains:
        counts: Counter[str] = Counter()
        for row in _all_link_rows(data):
            site = row.get("linking_site") or _norm_domain(str(row.get("source_page") or ""))
            if site:
                counts[site] += 1
        domains = [{"site": s, "link_count": c} for s, c in counts.most_common()]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(domains, limit, max_cap=50)
    return {"domains": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_backlinks_by_anchor_text(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "links": [], "total": 0, "truncated": False}
    data = _load_links(scoped, conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "links": [], "total": 0, "truncated": False}
    anchor = str(args.get("anchor_text") or args.get("anchor") or "").strip().lower()
    rows = _all_link_rows(data)
    if anchor:
        rows = [r for r in rows if anchor in str(r.get("anchor_text") or "").lower()]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(rows, limit, max_cap=100)
    return {"links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_backlinks_to_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "links": [], "total": 0, "truncated": False}
    target = str(args.get("url") or args.get("target_page") or "").strip().lower().rstrip("/")
    if not target:
        return {"error": "url is required", "links": [], "total": 0, "truncated": False}
    data = _load_links(scoped, conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "links": [], "total": 0, "truncated": False}
    rows = _all_link_rows(data)
    matched = [
        r for r in rows
        if target in str(r.get("target_page") or "").lower().rstrip("/")
        or target in str(r.get("target_url_on_linking_page") or "").lower().rstrip("/")
    ]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(matched, limit, max_cap=100)
    return {"url": target, "links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_backlinks_from_domain(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "links": [], "total": 0, "truncated": False}
    domain = strip_www_prefix(str(args.get("domain") or args.get("linking_site") or "").strip().lower())
    if not domain:
        return {"error": "domain is required", "links": [], "total": 0, "truncated": False}
    data = _load_links(scoped, conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "links": [], "total": 0, "truncated": False}
    rows = _all_link_rows(data)
    matched = [
        r for r in rows
        if domain in str(r.get("linking_site") or _norm_domain(str(r.get("source_page") or "")))
    ]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(matched, limit, max_cap=100)
    return {"domain": domain, "links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_anchor_text_distribution(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "missing": True}
    data = _load_links(scoped, conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "anchors": []}
    top_text = data.get("top_linking_text") or []
    if isinstance(top_text, list) and top_text:
        limit = parse_limit(args.get("limit"), 30, 100)
        sliced = cap_list(top_text, limit, max_cap=100)
        return {"anchors": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "source": "top_linking_text"}
    counts: Counter[str] = Counter()
    for row in _all_link_rows(data):
        text = str(row.get("anchor_text") or "").strip() or "(empty)"
        counts[text] += 1
    anchors = [{"anchor_text": t, "link_count": c} for t, c in counts.most_common()]
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(anchors, limit, max_cap=100)
    return {"anchors": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "source": "sample_links"}
