"""Image audit tools for chat and MCP."""
from __future__ import annotations

from typing import Any

import pandas as pd
from psycopg import Connection

from ._slice import cap_list, parse_limit
from .context import AuditToolContext
from .crawl_lists import _content_urls_list, _filter_crawl_pages

IMAGE_LIGHTHOUSE_AUDIT_IDS = frozenset({
    "uses-optimized-images",
    "uses-responsive-images",
    "preload-lcp-image",
    "image-aspect-ratio",
    "image-alt",
    "efficient-animated-content",
    "largest-contentful-paint",
})

_MODERN_IMAGE_TYPES = frozenset({"image/webp", "image/avif"})

_PREVIEW_LIMIT = 12


def _preview_from_bucket(rows: list[Any] | None, limit: int = _PREVIEW_LIMIT) -> dict[str, Any]:
    if not isinstance(rows, list) or not rows:
        return {"pages": [], "total": 0, "truncated": False}
    pages: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if isinstance(row, dict) and row.get("url"):
            pages.append(dict(row))
        elif isinstance(row, str) and row.strip():
            pages.append({"url": row.strip()})
    total = len(rows)
    return {"pages": pages, "total": total, "truncated": total > len(pages)}


def _lighthouse_image_previews(payload: dict[str, Any], limit: int = 8) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for d in payload.get("lighthouse_diagnostics") or []:
        if not isinstance(d, dict):
            continue
        audit_id = str(d.get("lighthouse_audit_id") or "")
        if audit_id not in IMAGE_LIGHTHOUSE_AUDIT_IDS:
            continue
        out.append({
            "title": str(d.get("title") or audit_id),
            "lighthouse_audit_id": audit_id,
            "url": str(d.get("url") or d.get("page") or ""),
            "display_value": d.get("display_value"),
        })
        if len(out) >= limit:
            break
    return out


def _int_val(val: Any) -> int:
    try:
        return int(val or 0)
    except (TypeError, ValueError):
        return 0


def _inventory_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("image_inventory")
    if not isinstance(raw, list):
        return []
    return [x for x in raw if isinstance(x, dict)]


def get_image_audit_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    df = scoped.load_crawl_df(conn)
    pages_missing_alt = 0
    pages_missing_lazy = 0
    pages_missing_dims = 0
    images_total = 0
    if df is not None and not df.empty and "status" in df.columns:
        work = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
        if "images_without_alt" in work.columns:
            pages_missing_alt = int((pd.to_numeric(work["images_without_alt"], errors="coerce").fillna(0) > 0).sum())
        if "img_without_lazy" in work.columns:
            pages_missing_lazy = int((pd.to_numeric(work["img_without_lazy"], errors="coerce").fillna(0) > 0).sum())
        if "img_without_dimensions" in work.columns:
            pages_missing_dims = int((pd.to_numeric(work["img_without_dimensions"], errors="coerce").fillna(0) > 0).sum())
        if "images_total" in work.columns:
            images_total = int(pd.to_numeric(work["images_total"], errors="coerce").fillna(0).sum())
    social = payload.get("social_coverage") if isinstance(payload.get("social_coverage"), dict) else {}
    inv_summary = payload.get("image_inventory_summary") if isinstance(payload.get("image_inventory_summary"), dict) else {}
    lh_image = 0
    for d in payload.get("lighthouse_diagnostics") or []:
        if isinstance(d, dict) and str(d.get("lighthouse_audit_id") or "") in IMAGE_LIGHTHOUSE_AUDIT_IDS:
            lh_image += 1
    content_urls = payload.get("content_urls") if isinstance(payload.get("content_urls"), dict) else {}
    og_missing = social.get("og_image_missing") if isinstance(social.get("og_image_missing"), list) else []
    return {
        "pages_missing_alt": pages_missing_alt or len(content_urls.get("missing_alt") or []),
        "pages_without_lazy_images": pages_missing_lazy or len(content_urls.get("missing_lazy") or []),
        "pages_missing_image_dimensions": pages_missing_dims or len(content_urls.get("missing_dimensions") or []),
        "images_total_crawled": images_total,
        "og_image_coverage_pct": social.get("og_image_coverage_pct"),
        "og_image_missing_count": len(og_missing),
        "lighthouse_image_diagnostics": lh_image,
        "image_inventory_available": bool(_inventory_from_payload(payload)),
        "image_inventory_summary": inv_summary,
        "page_previews": {
            "missing_alt": _preview_from_bucket(content_urls.get("missing_alt")),
            "missing_lazy": _preview_from_bucket(content_urls.get("missing_lazy")),
            "missing_dimensions": _preview_from_bucket(content_urls.get("missing_dimensions")),
            "missing_og": _preview_from_bucket(og_missing),
        },
        "lighthouse_image_previews": _lighthouse_image_previews(payload),
    }


def list_pages_without_lazy_images(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = _content_urls_list(conn, ctx, args, "missing_lazy")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: _int_val(r.get("img_without_lazy")) > 0,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "img_without_lazy": _int_val(r.get("img_without_lazy")),
            "images_total": _int_val(r.get("images_total")),
        },
    )


def list_pages_with_images_missing_dimensions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = _content_urls_list(conn, ctx, args, "missing_dimensions")
    if bucket.get("total", 0) > 0 or bucket.get("missing"):
        return bucket
    return _filter_crawl_pages(
        conn,
        ctx,
        args,
        predicate=lambda r: _int_val(r.get("img_without_dimensions")) > 0,
        projection=lambda r: {
            "url": str(r.get("url") or ""),
            "title": str(r.get("title") or ""),
            "img_without_dimensions": _int_val(r.get("img_without_dimensions")),
            "images_total": _int_val(r.get("images_total")),
        },
    )


def list_site_image_urls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "items": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 100)
    kind_filter = str(args.get("kind") or "").strip().lower()
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for link in payload.get("links") or []:
        if not isinstance(link, dict):
            continue
        page_url = str(link.get("url") or "")
        pa = link.get("page_analysis") if isinstance(link.get("page_analysis"), dict) else {}
        for u in pa.get("image_urls") or []:
            image_url = str(u or "").strip()
            if not image_url:
                continue
            key = (image_url, page_url, "content")
            if key in seen:
                continue
            if kind_filter and kind_filter != "content":
                continue
            seen.add(key)
            items.append({"image_url": image_url, "page_url": page_url, "kind": "content"})
        for kind, field in (("og", "og_image"), ("twitter", "twitter_image")):
            image_url = str(link.get(field) or "").strip()
            if not image_url:
                continue
            if kind_filter and kind_filter != kind:
                continue
            key = (image_url, page_url, kind)
            if key in seen:
                continue
            seen.add(key)
            items.append({"image_url": image_url, "page_url": page_url, "kind": kind})
    sliced = cap_list(items, limit, max_cap=100)
    return {"items": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_lighthouse_image_opportunities(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "diagnostics": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    diag = payload.get("lighthouse_diagnostics") or []
    filtered = [
        d for d in diag
        if isinstance(d, dict) and str(d.get("lighthouse_audit_id") or "") in IMAGE_LIGHTHOUSE_AUDIT_IDS
    ]
    sliced = cap_list(filtered, limit, max_cap=50)
    return {"diagnostics": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _threshold_kb(args: dict[str, Any], payload: dict[str, Any]) -> int:
    raw = args.get("min_size_kb")
    if raw is not None:
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            pass
    summary = payload.get("image_inventory_summary")
    if isinstance(summary, dict) and summary.get("unoptimized_min_kb") is not None:
        try:
            return max(1, int(summary["unoptimized_min_kb"]))
        except (TypeError, ValueError):
            pass
    return 200


def list_largest_images(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "items": [], "total": 0, "truncated": False}
    inventory = _inventory_from_payload(payload)
    if not inventory:
        return {
            "error": "image_inventory not in report — enable probe_image_inventory and rebuild report",
            "inventory_available": False,
            "items": [],
            "total": 0,
            "truncated": False,
        }
    min_kb = _threshold_kb(args, payload)
    min_bytes = min_kb * 1024
    ranked = [
        item for item in inventory
        if item.get("size_bytes") is not None and int(item["size_bytes"]) >= min_bytes
    ]
    ranked.sort(key=lambda x: int(x.get("size_bytes") or 0), reverse=True)
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(ranked, limit, max_cap=100)
    return {
        "items": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "inventory_available": True,
        "min_size_kb": min_kb,
    }


def list_unoptimized_images(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "items": [], "total": 0, "truncated": False}
    inventory = _inventory_from_payload(payload)
    if not inventory:
        return {
            "error": "image_inventory not in report — enable probe_image_inventory and rebuild report",
            "inventory_available": False,
            "items": [],
            "total": 0,
            "truncated": False,
        }
    min_kb = _threshold_kb(args, payload)
    min_bytes = min_kb * 1024
    hits: list[dict[str, Any]] = []
    for item in inventory:
        size = item.get("size_bytes")
        if size is None:
            continue
        size_i = int(size)
        if size_i < min_bytes:
            continue
        ctype = str(item.get("content_type") or "").lower().split(";")[0].strip()
        if ctype in _MODERN_IMAGE_TYPES:
            continue
        if ctype.startswith("image/") or not ctype:
            hits.append({**item, "reason": "large_non_modern_format"})
    hits.sort(key=lambda x: int(x.get("size_bytes") or 0), reverse=True)
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(hits, limit, max_cap=100)
    return {
        "items": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "inventory_available": True,
        "min_size_kb": min_kb,
    }


def list_images_needing_attention(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "items": [], "total": 0, "truncated": False}
    inventory = _inventory_from_payload(payload)
    page_issues: dict[str, set[str]] = {}
    content_urls = payload.get("content_urls") if isinstance(payload.get("content_urls"), dict) else {}
    for bucket, reason in (
        ("missing_alt", "page_missing_alt"),
        ("missing_lazy", "page_missing_lazy"),
        ("missing_dimensions", "page_missing_dimensions"),
    ):
        for row in content_urls.get(bucket) or []:
            if isinstance(row, dict) and row.get("url"):
                page_issues.setdefault(str(row["url"]), set()).add(reason)
    min_kb = _threshold_kb(args, payload)
    min_bytes = min_kb * 1024
    scored: list[dict[str, Any]] = []
    if inventory:
        for item in inventory:
            reasons: list[str] = []
            score = 0
            size = item.get("size_bytes")
            ctype = str(item.get("content_type") or "").lower().split(";")[0].strip()
            if size is not None and int(size) >= min_bytes:
                if ctype not in _MODERN_IMAGE_TYPES:
                    reasons.append("large_non_modern_format")
                    score += 3
                else:
                    reasons.append("large_file")
                    score += 2
            if item.get("error"):
                reasons.append("probe_failed")
                score += 1
            for page in item.get("source_pages") or []:
                for r in page_issues.get(str(page), set()):
                    if r not in reasons:
                        reasons.append(r)
                    score += 2
            if reasons:
                scored.append({
                    "url": item.get("url"),
                    "size_bytes": size,
                    "content_type": item.get("content_type"),
                    "source_pages": item.get("source_pages") or [],
                    "kinds": item.get("kinds") or [],
                    "reasons": reasons,
                    "attention_score": score,
                })
    else:
        for page, reasons in page_issues.items():
            scored.append({
                "url": None,
                "page_url": page,
                "reasons": sorted(reasons),
                "attention_score": len(reasons) * 2,
            })
    scored.sort(key=lambda x: int(x.get("attention_score") or 0), reverse=True)
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(scored, limit, max_cap=100)
    return {
        "items": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "inventory_available": bool(inventory),
    }
