"""
Map Lighthouse JSON (LHR) into rows for lh_audits / lh_audit_items.
Preserves thumbnails, url, node, and other item fields in row_data JSON.
"""
from __future__ import annotations

import json
from typing import Any

_CATEGORY_ORDER = ("performance", "accessibility", "best-practices", "seo", "pwa")


def _audit_id_to_category(categories: dict[str, Any]) -> dict[str, str]:
    """Map audit id -> first category id that references it (stable category order)."""
    out: dict[str, str] = {}
    for cat_id in _CATEGORY_ORDER:
        cat = categories.get(cat_id)
        if not isinstance(cat, dict):
            continue
        for ref in cat.get("auditRefs") or []:
            if not isinstance(ref, dict):
                continue
            aid = ref.get("id")
            if isinstance(aid, str) and aid and aid not in out:
                out[aid] = cat_id
    return out


def lhr_to_audit_rows(lhr: dict[str, Any]) -> tuple[list[dict[str, Any]], list[tuple[int, int, dict[str, Any]]]]:
    """
    Parse LHR root or lighthouseResult dict.

    Returns:
        audit_rows: list of column dicts for lh_audits (no run_id).
        items: list of (audit_row_index, item_index, row_data_dict) for lh_audit_items.
    """
    lr = lhr.get("lighthouseResult") or lhr
    if not isinstance(lr, dict):
        return [], []

    audits = lr.get("audits") or {}
    categories = lr.get("categories") or {}
    audit_to_cat = _audit_id_to_category(categories) if isinstance(categories, dict) else {}

    audit_rows: list[dict[str, Any]] = []
    items: list[tuple[int, int, dict[str, Any]]] = []

    if not isinstance(audits, dict):
        return [], []

    for audit_id, a in audits.items():
        if not isinstance(audit_id, str) or not isinstance(a, dict):
            continue

        details = a.get("details")
        details_type: str | None = None
        headings: Any = None
        details_meta: dict[str, Any] = {}
        raw_items: list[Any] = []

        if isinstance(details, dict):
            details_type = details.get("type") if isinstance(details.get("type"), str) else details.get("type")
            headings = details.get("headings")
            for k, v in details.items():
                if k in ("type", "headings", "items", "nodes"):
                    continue
                details_meta[k] = v
            raw_items = details.get("items") if isinstance(details.get("items"), list) else []
            if not raw_items and isinstance(details.get("nodes"), list):
                raw_items = details["nodes"]

        row: dict[str, Any] = {
            "audit_id": audit_id,
            "category_id": audit_to_cat.get(audit_id),
            "score": a.get("score"),
            "score_display_mode": a.get("scoreDisplayMode"),
            "title": a.get("title"),
            "description": a.get("description"),
            "display_value": a.get("displayValue"),
            "numeric_value": a.get("numericValue"),
            "help_text": a.get("helpText"),
            "details_type": details_type if isinstance(details_type, str) else None,
            "details_headings": json.dumps(headings, default=str) if headings is not None else None,
            "details_meta": json.dumps(details_meta, default=str) if details_meta else None,
        }

        audit_idx = len(audit_rows)
        audit_rows.append(row)

        if isinstance(raw_items, list):
            for i, item in enumerate(raw_items):
                if isinstance(item, dict):
                    items.append((audit_idx, i, item))

    return audit_rows, items
