"""Compare report issue diff CSV export."""
from __future__ import annotations

import csv
import io
from typing import Any


def _issue_key(cat: str, issue: dict[str, Any]) -> str:
    return f"{cat}|{issue.get('url') or ''}|{issue.get('message') or ''}"


def _collect_issues(payload: dict[str, Any]) -> dict[str, tuple[str, dict[str, Any]]]:
    out: dict[str, tuple[str, dict[str, Any]]] = {}
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        name = str(cat.get("name") or cat.get("id") or "")
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            key = _issue_key(name, issue)
            out[key] = (name, issue)
    return out


def export_compare_issues_csv(current: dict[str, Any], baseline: dict[str, Any]) -> str:
    issues_a = _collect_issues(current)
    issues_b = _collect_issues(baseline)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["change", "category", "priority", "url", "message", "recommendation"])
    for key, (cat, issue) in issues_a.items():
        if key not in issues_b:
            w.writerow([
                "removed",
                cat,
                issue.get("priority") or "",
                issue.get("url") or "",
                issue.get("message") or "",
                issue.get("recommendation") or "",
            ])
    for key, (cat, issue) in issues_b.items():
        if key not in issues_a:
            w.writerow([
                "added",
                cat,
                issue.get("priority") or "",
                issue.get("url") or "",
                issue.get("message") or "",
                issue.get("recommendation") or "",
            ])
    return buf.getvalue()
