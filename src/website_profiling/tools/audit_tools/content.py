"""Content quality and social coverage tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import cap_list, parse_limit, payload_dict_slice, payload_field
from .context import AuditToolContext


def get_content_analytics(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "content_analytics")


def get_content_duplicates(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "duplicates": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    return payload_field(payload, "content_duplicates", limit, max_cap=50, item_key="duplicates")


def get_social_coverage(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "social_coverage")


def get_keyword_opportunities(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "keyword_opportunities")


def get_ner_site_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "ner_site_summary")


def list_thin_content_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    analytics = payload.get("content_analytics") or {}
    thin = analytics.get("thin_pages") if isinstance(analytics, dict) else None
    if not isinstance(thin, list) or not thin:
        thin_count = int((payload.get("seo_health") or {}).get("thin_content") or 0)
        return {
            "pages": [],
            "total": thin_count,
            "truncated": False,
            "note": "thin page URLs not listed; only count available in seo_health",
        }
    sliced = cap_list(thin, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_duplicate_cluster(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    clusters = payload.get("content_duplicates") or []
    if not isinstance(clusters, list):
        return {"error": "content_duplicates not in report", "missing": True}
    url = str(args.get("url") or "").strip().rstrip("/").lower()
    cluster_index = args.get("cluster_index")
    if cluster_index is not None:
        try:
            idx = int(cluster_index)
        except (TypeError, ValueError):
            return {"error": "invalid cluster_index"}
        if idx < 0 or idx >= len(clusters):
            return {"error": "cluster_index out of range"}
        cluster = clusters[idx]
        if not isinstance(cluster, dict):
            return {"error": "cluster not found"}
        return {"cluster_index": idx, "cluster": cluster}
    if url:
        for i, cluster in enumerate(clusters):
            if not isinstance(cluster, dict):
                continue
            rep = str(cluster.get("representative_url") or "").strip().rstrip("/").lower()
            members = cluster.get("member_urls") or []
            member_norm = {str(u).strip().rstrip("/").lower() for u in members if u}
            if url == rep or url in member_norm:
                return {"cluster_index": i, "cluster": cluster}
        return {"error": "url not found in duplicate clusters", "url": url}
    return {"error": "cluster_index or url is required"}
