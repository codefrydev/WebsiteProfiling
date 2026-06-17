"""
Parse Google Search Console Links report CSV exports.

GSC does not expose Links via the Search Console API; users export CSV from the UI.
Auto-detects export type from header row.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any

from ...common import strip_www_prefix

from .normalize import build_crawl_norm_map, normalize_url

_SECTION_KEYS = (
    "top_linking_sites",
    "top_linked_pages",
    "top_linking_text",
    "sample_links",
    "latest_links",
)


def _norm_header(h: str) -> str:
    return (h or "").strip().lower().replace("\ufeff", "")


def _find_col(headers: list[str], *needles: str) -> str | None:
    for raw in headers:
        n = _norm_header(raw)
        if all(needle in n for needle in needles):
            return raw
    for raw in headers:
        n = _norm_header(raw)
        if any(needle in n for needle in needles):
            return raw
    return None


def _parse_int(val: str) -> int:
    s = (val or "").strip().replace(",", "")
    if not s or s in ("~", "-"):
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def detect_export_type(headers: list[str]) -> str | None:
    """Return export type key or None if unrecognized."""
    norm = [_norm_header(h) for h in headers]
    joined = " ".join(norm)

    if "source page" in joined or ("source" in joined and "target page" in joined):
        if any("discover" in n or "first" in n for n in norm):
            return "latest_links"
        return "sample_links"

    if "link text" in joined or ("linking text" in joined):
        if "target page" not in joined and "source" not in joined:
            return "top_linking_text"

    if "target page" in joined and ("linking sites" in joined or "linking site" in joined):
        return "top_linked_pages"

    if ("site" in joined or "domain" in joined) and "target page" in joined:
        return "top_linking_sites"

    site_col = _find_col(headers, "site")
    target_pages_col = _find_col(headers, "target", "page")
    if site_col and target_pages_col:
        return "top_linking_sites"

    target_col = _find_col(headers, "target", "page")
    linking_sites_col = _find_col(headers, "linking", "site")
    if target_col and linking_sites_col:
        return "top_linked_pages"

    text_col = _find_col(headers, "link", "text")
    if text_col and not target_col:
        return "top_linking_text"

    source_col = _find_col(headers, "source")
    if source_col and target_col:
        return "sample_links"

    return None


def parse_gsc_links_csv(csv_text: str) -> tuple[str, list[dict[str, Any]]]:
    """
    Parse CSV text. Returns (export_type, rows).
    Raises ValueError on empty or unrecognized format.
    """
    text = (csv_text or "").strip()
    if not text:
        raise ValueError("CSV content is empty")

    # GSC exports may use UTF-8 BOM
    if text.startswith("\ufeff"):
        text = text[1:]

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")

    headers = [h for h in reader.fieldnames if h]
    export_type = detect_export_type(headers)
    if not export_type:
        raise ValueError(
            "Unrecognized GSC Links export format. "
            "Export from Search Console → Links (Top linking sites, Top linked pages, "
            "Top linking text, or Latest/More sample links)."
        )

    rows: list[dict[str, Any]] = []
    for raw_row in reader:
        if not raw_row:
            continue
        row = parse_row(export_type, headers, raw_row)
        if row:
            rows.append(row)

    if not rows:
        raise ValueError("CSV contains no data rows")

    return export_type, rows


def parse_row(
    export_type: str,
    headers: list[str],
    raw_row: dict[str, str | None],
) -> dict[str, Any] | None:
    """Parse one CSV row into a normalized dict for the given export type."""

    def get(*needles: str) -> str:
        col = _find_col(headers, *needles)
        if col and col in raw_row:
            return str(raw_row.get(col) or "").strip()
        return ""

    if export_type == "top_linking_sites":
        site = get("site") or get("domain")
        if not site:
            return None
        return {
            "site": site,
            "link_count": _parse_int(get("link")),
            "target_page_count": _parse_int(get("target", "page")),
        }

    if export_type == "top_linked_pages":
        target = get("target", "page")
        if not target:
            return None
        return {
            "target_page": target,
            "link_count": _parse_int(get("link")),
            "linking_site_count": _parse_int(get("linking", "site")),
        }

    if export_type == "top_linking_text":
        text = get("link", "text") or get("linking", "text")
        if text == "(empty)":
            text = ""
        return {
            "anchor_text": text,
            "link_count": _parse_int(get("link")),
        }

    if export_type in ("sample_links", "latest_links"):
        source = get("source", "page") or get("source")
        target = get("target", "page") or get("target")
        if not source and not target:
            return None
        target_alt = get("target", "url")
        discovered = get("discover") or get("first")
        anchor = get("link", "text") or get("anchor")
        row: dict[str, Any] = {
            "source_page": source,
            "target_page": target or target_alt,
        }
        if target_alt and target_alt != row["target_page"]:
            row["target_url_on_linking_page"] = target_alt
        if anchor:
            row["anchor_text"] = anchor if anchor != "(empty)" else ""
        if discovered:
            row["discovered_at"] = discovered
        # Extract domain from source URL
        try:
            from urllib.parse import urlparse

            host = strip_www_prefix(urlparse(source).netloc.lower())
            if host:
                row["linking_site"] = host
        except Exception:
            pass
        return row

    return None


def _empty_snapshot() -> dict[str, Any]:
    return {
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "source": "gsc_links_csv",
        "export_types": [],
        "row_counts": {},
        "top_linking_sites": [],
        "top_linked_pages": [],
        "top_linking_text": [],
        "sample_links": [],
        "latest_links": [],
        "sample_links_full_count": 0,
        "latest_links_full_count": 0,
        "errors": [],
    }


def merge_parsed_into_snapshot(
    base: dict[str, Any] | None,
    export_type: str,
    rows: list[dict[str, Any]],
    *,
    crawl_norm_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Merge parsed rows into snapshot, replacing the section for export_type."""
    out = dict(base) if base else _empty_snapshot()
    out["imported_at"] = datetime.now(timezone.utc).isoformat()
    out["source"] = "gsc_links_csv"

    export_types: list[str] = list(out.get("export_types") or [])
    if export_type not in export_types:
        export_types.append(export_type)
    out["export_types"] = export_types

    row_counts: dict[str, int] = dict(out.get("row_counts") or {})
    row_counts[export_type] = len(rows)
    out["row_counts"] = row_counts

    if crawl_norm_map:
        rows = _annotate_crawl_match(rows, export_type, crawl_norm_map)

    out[export_type] = rows
    if export_type == "sample_links":
        out["sample_links_full_count"] = len(rows)
    elif export_type == "latest_links":
        out["latest_links_full_count"] = len(rows)

    return out


def _annotate_crawl_match(
    rows: list[dict[str, Any]],
    export_type: str,
    crawl_norm_map: dict[str, str],
) -> list[dict[str, Any]]:
    """Add target_in_crawl and crawl_url when target matches a crawled URL."""
    if export_type not in ("top_linked_pages", "sample_links", "latest_links"):
        return rows
    annotated: list[dict[str, Any]] = []
    for row in rows:
        r = dict(row)
        target = str(r.get("target_page") or "").strip()
        if target:
            key = normalize_url(target)
            if key in crawl_norm_map:
                r["target_in_crawl"] = True
                r["crawl_url"] = crawl_norm_map[key]
            else:
                r["target_in_crawl"] = False
        annotated.append(r)
    return annotated


def build_crawl_norm_from_urls(crawl_urls: list[str]) -> dict[str, str]:
    links = [{"url": u} for u in crawl_urls if u]
    return build_crawl_norm_map(links)


def parse_and_merge(
    csv_text: str,
    existing: dict[str, Any] | None = None,
    *,
    crawl_urls: list[str] | None = None,
    file_name: str = "",
) -> dict[str, Any]:
    """Parse one CSV file and merge into snapshot dict (does not persist)."""
    export_type, rows = parse_gsc_links_csv(csv_text)
    crawl_norm = build_crawl_norm_from_urls(crawl_urls or []) if crawl_urls else None
    merged = merge_parsed_into_snapshot(
        existing,
        export_type,
        rows,
        crawl_norm_map=crawl_norm,
    )
    if file_name:
        imports: list[str] = list(merged.get("import_file_names") or [])
        imports.append(file_name)
        merged["import_file_names"] = imports[-20:]
    return merged
