"""Parse competitor keyword exports (Ahrefs / Semrush CSV)."""
from __future__ import annotations

import csv
import io
from typing import Any


def parse_competitor_keyword_csv(csv_text: str, *, competitor: str = "") -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(csv_text or ""))
    if not reader.fieldnames:
        return []
    rows: list[dict[str, Any]] = []
    for raw in reader:
        kw = (
            raw.get("Keyword")
            or raw.get("keyword")
            or raw.get("Query")
            or raw.get("query")
            or ""
        ).strip()
        if not kw:
            continue
        rows.append({
            "keyword": kw,
            "competitor": competitor,
            "volume": raw.get("Volume") or raw.get("volume") or raw.get("Search Volume"),
            "position": raw.get("Position") or raw.get("position") or raw.get("Current position"),
            "url": raw.get("URL") or raw.get("url") or raw.get("Landing page"),
            "source": "competitor_csv",
        })
    return rows
