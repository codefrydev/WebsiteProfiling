"""Browser runtime diagnostics: console messages, page errors, failed requests."""

from __future__ import annotations

import json
from typing import Any, Optional

_TEXT_MAX = 500


def parse_console_levels(raw: str) -> frozenset[str]:
    parts = [p.strip().lower() for p in (raw or "error,warning").split(",") if p.strip()]
    return frozenset(parts) if parts else frozenset({"error", "warning"})


def truncate_diag_text(value: Any, max_len: int = _TEXT_MAX) -> str:
    s = str(value or "")
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def finalize_browser_diagnostics(
    console: list[dict[str, Any]],
    page_errors: list[dict[str, Any]],
    failed_requests: list[dict[str, Any]],
) -> dict[str, Any]:
    console_error_count = sum(1 for c in console if c.get("level") == "error")
    console_warning_count = sum(1 for c in console if c.get("level") == "warning")
    return {
        "console": console,
        "page_errors": page_errors,
        "failed_requests": failed_requests,
        "summary": {
            "console_error_count": console_error_count,
            "console_warning_count": console_warning_count,
            "page_error_count": len(page_errors),
            "failed_request_count": len(failed_requests),
        },
    }


def merge_browser_into_page_analysis(
    page_analysis_json: Optional[str],
    browser_diagnostics: Optional[dict[str, Any]],
) -> str:
    if not browser_diagnostics:
        return page_analysis_json or "{}"
    pa: dict[str, Any] = {}
    if page_analysis_json:
        try:
            parsed = json.loads(page_analysis_json)
            if isinstance(parsed, dict):
                pa = parsed
        except json.JSONDecodeError:
            pa = {}
    pa["browser"] = browser_diagnostics
    axe = browser_diagnostics.get("axe_violations")
    if isinstance(axe, list) and axe:
        pa["axe_violations"] = axe
    return json.dumps(pa)


def browser_summary_from_page_analysis(pa: dict[str, Any]) -> dict[str, int]:
    browser = pa.get("browser") if isinstance(pa.get("browser"), dict) else {}
    console = browser.get("console")
    page_errors = browser.get("page_errors")
    failed_requests = browser.get("failed_requests")

    if isinstance(console, list) or isinstance(page_errors, list) or isinstance(failed_requests, list):
        console_list = console if isinstance(console, list) else []
        page_error_list = page_errors if isinstance(page_errors, list) else []
        failed_request_list = failed_requests if isinstance(failed_requests, list) else []
        return {
            "console_error_count": sum(
                1 for c in console_list if isinstance(c, dict) and c.get("level") == "error"
            ),
            "console_warning_count": sum(
                1 for c in console_list if isinstance(c, dict) and c.get("level") == "warning"
            ),
            "page_error_count": len(page_error_list),
            "failed_request_count": len(failed_request_list),
        }

    summary = browser.get("summary") if isinstance(browser.get("summary"), dict) else {}
    return {
        "console_error_count": int(summary.get("console_error_count") or 0),
        "console_warning_count": int(summary.get("console_warning_count") or 0),
        "page_error_count": int(summary.get("page_error_count") or 0),
        "failed_request_count": int(summary.get("failed_request_count") or 0),
    }


def _parse_page_analysis_cell(raw: object) -> dict[str, Any]:
    if raw is None:
        return {}
    try:
        import pandas as pd

        if isinstance(raw, float) and pd.isna(raw):
            return {}
    except Exception:
        pass
    s = str(raw).strip()
    if not s or s == "{}":
        return {}
    try:
        o = json.loads(s)
        return o if isinstance(o, dict) else {}
    except json.JSONDecodeError:
        return {}


def aggregate_browser_diagnostics_df(df) -> dict[str, Any]:
    """Site-level browser diagnostic counts from crawl DataFrame page_analysis cells."""
    pages_with_console_errors = 0
    pages_with_page_errors = 0
    pages_with_failed_requests = 0
    total_console_errors = 0
    total_page_errors = 0
    total_failed_requests = 0
    message_counts: dict[str, dict[str, Any]] = {}
    exception_counts: dict[str, dict[str, Any]] = {}

    if df is None or getattr(df, "empty", True) or "page_analysis" not in df.columns:
        return {}

    for _, row in df.iterrows():
        pa = _parse_page_analysis_cell(row.get("page_analysis"))
        if not pa:
            continue
        counts = browser_summary_from_page_analysis(pa)
        url = str(row.get("url") or "").strip()
        ce = counts["console_error_count"]
        pe = counts["page_error_count"]
        fr = counts["failed_request_count"]
        if ce > 0:
            pages_with_console_errors += 1
            total_console_errors += ce
        if pe > 0:
            pages_with_page_errors += 1
            total_page_errors += pe
        if fr > 0:
            pages_with_failed_requests += 1
            total_failed_requests += fr
        browser = pa.get("browser") if isinstance(pa.get("browser"), dict) else {}
        for msg in browser.get("console") or []:
            if not isinstance(msg, dict) or msg.get("level") != "error":
                continue
            text = str(msg.get("text") or "").strip()
            if not text:
                continue
            bucket = message_counts.setdefault(text, {"text": text, "count": 0, "sample_urls": []})
            bucket["count"] += 1
            if url and url not in bucket["sample_urls"] and len(bucket["sample_urls"]) < 3:
                bucket["sample_urls"].append(url)
        for err in browser.get("page_errors") or []:
            if not isinstance(err, dict):
                continue
            text = str(err.get("message") or "").strip()
            if not text:
                continue
            bucket = exception_counts.setdefault(text, {"text": text, "count": 0, "sample_urls": []})
            bucket["count"] += 1
            if url and url not in bucket["sample_urls"] and len(bucket["sample_urls"]) < 3:
                bucket["sample_urls"].append(url)

    if (
        pages_with_console_errors == 0
        and pages_with_page_errors == 0
        and pages_with_failed_requests == 0
        and total_console_errors == 0
        and total_page_errors == 0
        and total_failed_requests == 0
    ):
        return {}

    top_console_messages = sorted(
        message_counts.values(),
        key=lambda x: int(x.get("count") or 0),
        reverse=True,
    )[:5]
    top_page_errors = sorted(
        exception_counts.values(),
        key=lambda x: int(x.get("count") or 0),
        reverse=True,
    )[:5]

    return {
        "pages_with_console_errors": pages_with_console_errors,
        "pages_with_page_errors": pages_with_page_errors,
        "pages_with_failed_requests": pages_with_failed_requests,
        "total_console_errors": total_console_errors,
        "total_page_errors": total_page_errors,
        "total_failed_requests": total_failed_requests,
        "top_console_messages": top_console_messages,
        "top_page_errors": top_page_errors,
    }
