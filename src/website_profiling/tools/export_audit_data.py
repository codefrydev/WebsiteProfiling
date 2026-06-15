"""Audit export data helpers."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from ..reporting.terminology import category_display_name
from ..scoring import round_half_up

_GLOSSARY_ROWS: list[tuple[str, str]] = [
    ("Crawl", "URLs fetched by the site spider (status codes, titles, inlinks)."),
    ("Lighthouse", "Lab Core Web Vitals audit (LCP, CLS, TBT, and category scores)."),
    ("Google Search Console", "Queries, pages, clicks, impressions, and average position from GSC."),
    ("Google Analytics 4", "Sessions, users, and engagement from GA4."),
    ("Estimated", "Derived from crawl text only — not Google search volume or rankings."),
    ("AI insights", "Optional LLM summaries — verify before client delivery."),
]

_ISSUE_LIMIT_HTML = 200
_ISSUE_LIMIT_PDF = 80
_LINK_LIMIT = 50


def _issue_recommendation(issue: dict[str, Any]) -> tuple[str, str]:
    """Return (display recommendation, llm_recommendation if distinct)."""
    rule = str(issue.get("recommendation") or "").strip()
    llm = str(issue.get("llm_recommendation") or "").strip()
    if llm and llm != rule:
        display = llm if llm else rule
        return display, llm
    return llm or rule, llm


def _issues_rows(payload: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cat_name = str(cat.get("name") or "")
        ui_name = category_display_name(cat_name)
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            rec, llm_rec = _issue_recommendation(issue)
            rows.append({
                "category": ui_name,
                "priority": str(issue.get("priority") or ""),
                "message": str(issue.get("message") or ""),
                "url": str(issue.get("url") or ""),
                "recommendation": rec,
                "llm_recommendation": llm_rec,
            })
    return rows


def _executive_export_data(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize executive_summary and legacy recommendations for export."""
    exec_sum = payload.get("executive_summary")
    summary = ""
    priorities: list[str] = []
    top_issues: list[dict[str, Any]] = []
    source = ""
    if isinstance(exec_sum, dict):
        summary = str(exec_sum.get("summary") or "").strip()
        source = str(exec_sum.get("source") or "").strip()
        raw_pri = exec_sum.get("priorities") or []
        if isinstance(raw_pri, list):
            priorities = [str(p).strip() for p in raw_pri if str(p).strip()]
        raw_top = exec_sum.get("top_issues") or []
        if isinstance(raw_top, list):
            top_issues = [i for i in raw_top if isinstance(i, dict)][:8]

    legacy_recs = payload.get("recommendations") or []
    legacy_list: list[str] = []
    if isinstance(legacy_recs, list):
        legacy_list = [str(r).strip() for r in legacy_recs if str(r).strip()]

    if not summary and legacy_list:
        summary = "\n".join(f"• {r}" for r in legacy_list[:12])

    return {
        "summary": summary,
        "priorities": priorities,
        "top_issues": top_issues,
        "source": source,
        "legacy_recommendations": legacy_list,
    }


def _executive_source_label(source: str) -> str:
    if source == "ai_insights":
        return "AI insights"
    if source == "deterministic":
        return "Measured + Search Console"
    return source or "Audit data"

def _priority_sort_key(row: dict[str, str]) -> int:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return order.get(row["priority"].lower(), 9)


def _summary_lines(payload: dict[str, Any]) -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []
    site = str(payload.get("site_name") or "Site")
    lines.append(("Property", site))
    if payload.get("report_generated_at"):
        lines.append(("Report generated", str(payload["report_generated_at"])))
    meta = payload.get("report_meta") or {}
    if isinstance(meta, dict):
        sources = meta.get("data_sources") or []
        if sources:
            lines.append(("Data sources", ", ".join(str(s) for s in sources)))
        scope = meta.get("crawl_scope") or {}
        if isinstance(scope, dict) and scope.get("pages_crawled") is not None:
            pages = scope.get("pages_crawled")
            max_p = scope.get("max_pages_configured")
            scope_txt = f"{pages} pages crawled"
            if max_p:
                scope_txt += f" (limit {max_p})"
            if scope.get("crawl_limited"):
                scope_txt += " — crawl limit reached"
            render_mode = scope.get("render_mode")
            if render_mode == "javascript":
                js_c = scope.get("js_concurrency")
                scope_txt += " — JavaScript rendering"
                if js_c:
                    scope_txt += f" ({js_c} parallel pages)"
            elif render_mode == "auto":
                scope_txt += " — auto rendering (static + JS fallback)"
                ps = scope.get("pages_static")
                pr = scope.get("pages_rendered")
                if ps is not None and pr is not None:
                    scope_txt += f" ({ps} static, {pr} JavaScript-rendered)"
            elif scope.get("static_html_only"):
                scope_txt += " — static HTML only"
            lines.append(("Crawl scope", scope_txt))
            browser_diag = scope.get("browser_diagnostics")
            if isinstance(browser_diag, dict):
                pce = browser_diag.get("pages_with_console_errors")
                tce = browser_diag.get("total_console_errors")
                ppe = browser_diag.get("pages_with_page_errors")
                if pce or ppe:
                    parts = []
                    if pce:
                        parts.append(f"{pce} page(s) with console errors ({tce or 0} total)")
                    if ppe:
                        parts.append(f"{ppe} page(s) with uncaught JS errors")
                    lines.append(("Browser diagnostics", "; ".join(parts)))
        if meta.get("google_fetched_at"):
            lines.append(("Google data fetched", str(meta["google_fetched_at"])))
    summary = payload.get("summary") or {}
    if isinstance(summary, dict):
        for key, label in (
            ("total_urls", "URLs in crawl"),
            ("indexable", "Indexable URLs"),
            ("issues_count", "Total issues"),
            ("critical_issues", "Critical issues"),
        ):
            if summary.get(key) is not None:
                lines.append((label, str(summary[key])))
    status = payload.get("status_counts") or {}
    if isinstance(status, dict) and status:
        parts = [f"{k}: {v}" for k, v in sorted(status.items(), key=lambda x: -int(x[1] or 0))[:8]]
        lines.append(("HTTP status mix", ", ".join(parts)))
    return lines


def _format_report_date(value: str) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    except ValueError:
        return value


def _overall_score(payload: dict[str, Any]) -> Optional[int]:
    scores: list[float] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        raw = cat.get("score")
        if raw is None:
            continue
        try:
            scores.append(float(raw))
        except (TypeError, ValueError):
            continue
    if not scores:
        return None
    return round_half_up(sum(scores) / len(scores))


def _score_band(score: Optional[float]) -> tuple[str, str]:
    if score is None:
        return "—", "score-na"
    rounded = int(round(score))
    if rounded >= 80:
        return str(rounded), "score-good"
    if rounded >= 60:
        return str(rounded), "score-fair"
    return str(rounded), "score-poor"


def _issue_priority_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for row in rows:
        key = row["priority"].lower()
        if key in counts:
            counts[key] += 1
    return counts


