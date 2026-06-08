"""Export crawl workbook as ZIP of CSV sheets."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from typing import Any


def _csv_bytes(rows: list[dict[str, Any]], columns: list[str]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in columns})
    return buf.getvalue().encode("utf-8")


def _parse_custom_fields(raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    text = str(raw).strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(k): str(v) for k, v in parsed.items()}


def _custom_field_rows(links: list[Any]) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    field_names: set[str] = set()
    for row in links:
        if not isinstance(row, dict):
            continue
        url = row.get("url")
        custom_extract = row.get("custom_extract")
        fields = _parse_custom_fields(row.get("custom_fields"))
        if not url or (not custom_extract and not fields):
            continue
        field_names.update(fields.keys())
        rows.append({"url": url, "custom_extract": custom_extract or "", **fields})
    columns = ["url", "custom_extract", *sorted(field_names)]
    return rows, columns


def build_crawl_workbook_zip(report_payload: dict[str, Any]) -> bytes:
    """Build ZIP containing Internal URLs, Links, Redirects, Issues CSVs."""
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as zf:
        links = report_payload.get("links") or []
        if isinstance(links, list) and links:
            url_cols = [
                "url", "status", "title", "meta_description", "h1",
                "canonical_url", "inlinks", "outlinks", "depth", "word_count",
            ]
            zf.writestr("internal_urls.csv", _csv_bytes(links, url_cols))

        link_edges = report_payload.get("link_edges") or []
        if isinstance(link_edges, list) and link_edges:
            edge_cols = [
                "from_url", "to_url", "anchor_text", "rel",
                "is_nofollow", "is_sponsored", "is_ugc", "link_type",
            ]
            zf.writestr("links.csv", _csv_bytes(link_edges, edge_cols))

        redirects = report_payload.get("redirects") or []
        if isinstance(redirects, list) and redirects:
            zf.writestr(
                "redirects.csv",
                _csv_bytes(redirects, ["url", "message", "priority", "recommendation"]),
            )

        issue_rows: list[dict[str, Any]] = []
        for cat in report_payload.get("categories") or []:
            if not isinstance(cat, dict):
                continue
            cat_name = cat.get("name") or cat.get("id") or ""
            for iss in cat.get("issues") or []:
                if isinstance(iss, dict):
                    issue_rows.append({**iss, "category": cat_name})
        if issue_rows:
            zf.writestr(
                "issues.csv",
                _csv_bytes(
                    issue_rows,
                    [
                        "category", "priority", "message", "url",
                        "impact_score", "gsc_clicks", "gsc_impressions", "ga4_sessions",
                        "recommendation",
                    ],
                ),
            )

        custom_rows, custom_cols = _custom_field_rows(links if isinstance(links, list) else [])
        if custom_rows:
            zf.writestr("custom_fields.csv", _csv_bytes(custom_rows, custom_cols))

    return mem.getvalue()
