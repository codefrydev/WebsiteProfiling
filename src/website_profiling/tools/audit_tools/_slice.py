"""Shared list slicing and payload field helpers for audit tools."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pandas as pd


def parse_limit(raw: Any, default: int, max_cap: int) -> int:
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, max_cap))


def cap_list(items: list[Any], limit: int, *, max_cap: int | None = None) -> dict[str, Any]:
    cap = max_cap if max_cap is not None else limit
    limit = max(1, min(limit, cap))
    total = len(items)
    truncated = total > limit
    return {"items": items[:limit], "total": total, "truncated": truncated}


def payload_field(
    payload: dict[str, Any],
    key: str,
    limit: int = 50,
    *,
    max_cap: int = 50,
    filter_fn: Callable[[Any], bool] | None = None,
    item_key: str = "items",
) -> dict[str, Any]:
    raw = payload.get(key)
    if raw is None:
        return {item_key: [], "total": 0, "truncated": False, "missing": True}
    if not isinstance(raw, list):
        return {item_key: [raw] if raw else [], "total": 1 if raw else 0, "truncated": False}
    items = raw
    if filter_fn:
        items = [x for x in items if filter_fn(x)]
    sliced = cap_list(items, limit, max_cap=max_cap)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def payload_dict_slice(
    payload: dict[str, Any],
    key: str,
    *,
    fields: list[str] | None = None,
) -> dict[str, Any]:
    raw = payload.get(key)
    if not isinstance(raw, dict):
        return {"data": None, "missing": True}
    if fields:
        return {"data": {k: raw.get(k) for k in fields if k in raw}, "missing": False}
    return {"data": raw, "missing": False}


def crawl_filter(
    df: pd.DataFrame | None,
    *,
    status: str = "",
    url_contains: str = "",
    has_schema: bool | None = None,
    schema_type: str = "",
    limit: int = 30,
    max_cap: int = 30,
) -> dict[str, Any]:
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    records = df.to_dict(orient="records")
    if status:
        records = [r for r in records if str(r.get("status") or "") == status]
    if url_contains:
        needle = url_contains.lower()
        records = [r for r in records if needle in str(r.get("url") or "").lower()]
    if has_schema is not None:
        records = [
            r for r in records
            if _row_has_schema(r) == has_schema
        ]
    if schema_type:
        needle = schema_type.lower()
        records = [r for r in records if needle in _row_schema_types(r)]
    pages = [
        {
            "url": str(r.get("url") or ""),
            "status": str(r.get("status") or ""),
            "title": str(r.get("title") or ""),
            "has_schema": _row_has_schema(r),
            "schema_types": _row_schema_types_list(r),
        }
        for r in records
    ]
    sliced = cap_list(pages, limit, max_cap=max_cap)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _row_has_schema(row: dict[str, Any]) -> bool:
    val = str(row.get("has_schema") or "").lower()
    return val in ("true", "1", "yes")


def _parse_page_analysis(row: dict[str, Any]) -> dict[str, Any]:
    import json

    pa = row.get("page_analysis")
    if isinstance(pa, dict):
        return pa
    if isinstance(pa, str) and pa.strip():
        try:
            parsed = json.loads(pa)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _row_schema_types_list(row: dict[str, Any]) -> list[str]:
    pa = _parse_page_analysis(row)
    types = pa.get("json_ld_types") or pa.get("schema_types") or []
    if isinstance(types, str):
        return [types] if types else []
    if isinstance(types, list):
        return [str(t) for t in types if t]
    return []


def _row_schema_types(row: dict[str, Any]) -> str:
    return " ".join(_row_schema_types_list(row)).lower()
