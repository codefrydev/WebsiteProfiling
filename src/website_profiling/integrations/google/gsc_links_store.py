"""
Read/write gsc_links_data table (GSC Links CSV import snapshots).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_row_json, _sanitize_for_json

_PAYLOAD_SAMPLE_CAP = 2000


def write_gsc_links_data(
    conn: Connection,
    data: dict[str, Any],
    *,
    property_id: int | None = None,
) -> None:
    """Insert a new gsc_links_data snapshot scoped to property_id."""
    if property_id is None:
        raise RuntimeError(
            "property_id is required to store GSC links data. Set active_property_id."
        )
    fetched_at = data.get("imported_at") or datetime.now(timezone.utc).isoformat()
    payload = {**data, "property_id": property_id}
    conn.execute(
        "INSERT INTO gsc_links_data (fetched_at, data, property_id) VALUES (%s, %s, %s)",
        (fetched_at, Json(_sanitize_for_json(payload)), property_id),
    )
    conn.commit()


def read_latest_gsc_links_data(
    conn: Connection,
    property_id: int | None = None,
    *,
    for_report: bool = True,
) -> dict[str, Any] | None:
    """Return latest gsc_links_data row for property_id."""
    if property_id is None:
        return None
    try:
        cur = conn.execute(
            """
            SELECT data FROM gsc_links_data
            WHERE property_id = %s
            ORDER BY id DESC LIMIT 1
            """,
            (property_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        if not isinstance(data, dict):
            return None
        if for_report:
            return _cap_for_payload(data)
        return data
    except Exception:
        return None


def _cap_for_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Truncate large link lists for report/API payload; full data stays in DB."""
    out = dict(data)
    sample = list(out.get("sample_links") or [])
    latest = list(out.get("latest_links") or [])
    full_sample = len(sample)
    full_latest = len(latest)
    out["sample_links_full_count"] = full_sample
    out["latest_links_full_count"] = full_latest

    combined_cap = _PAYLOAD_SAMPLE_CAP
    if len(sample) > combined_cap:
        out["sample_links"] = sample[:combined_cap]
    if len(latest) > max(0, combined_cap - len(out.get("sample_links") or [])):
        latest_cap = max(0, combined_cap - len(out.get("sample_links") or []))
        out["latest_links"] = latest[:latest_cap]

    return out


def import_gsc_links_csv(
    conn: Connection,
    property_id: int,
    csv_text: str,
    *,
    crawl_urls: list[str] | None = None,
    file_name: str = "",
) -> dict[str, Any]:
    """
    Parse CSV, merge with latest snapshot for property, persist, return summary.
    """
    from .gsc_links_csv import parse_and_merge

    existing = read_latest_gsc_links_data(conn, property_id, for_report=False)
    merged = parse_and_merge(
        csv_text,
        existing,
        crawl_urls=crawl_urls,
        file_name=file_name,
    )
    write_gsc_links_data(conn, merged, property_id=property_id)
    return {
        "ok": True,
        "imported_at": merged.get("imported_at"),
        "export_types": merged.get("export_types"),
        "row_counts": merged.get("row_counts"),
        "last_export_type": _last_export_type(merged),
    }


def _last_export_type(data: dict[str, Any]) -> str | None:
    types = data.get("export_types") or []
    return types[-1] if types else None


def read_gsc_links_status(
    conn: Connection,
    property_id: int,
) -> dict[str, Any]:
    """Lightweight status for Integrations UI."""
    data = read_latest_gsc_links_data(conn, property_id, for_report=False)
    if not data:
        return {"hasData": False}
    return {
        "hasData": True,
        "lastImportedAt": data.get("imported_at"),
        "exportTypes": data.get("export_types") or [],
        "rowCounts": data.get("row_counts") or {},
        "referringDomainCount": len(data.get("top_linking_sites") or []),
        "topLinkedPageCount": len(data.get("top_linked_pages") or []),
        "sampleLinkCount": len(data.get("sample_links") or []),
        "latestLinkCount": len(data.get("latest_links") or []),
    }
