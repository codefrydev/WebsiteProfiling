"""Report category: performance."""
from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from urllib.parse import urlparse

from ._helpers import (
    PRIORITY_ORDER,
    RESPONSE_TIME_SLOW_MS,
    _issue,
    _score_deductions,
    _sort_issues,
)
from ...lighthouse.audit_text import (
    failure_display_message,
    failure_help_text,
    is_core_web_vitals_failure,
)
from ...tools.warnings import _resolve_entry, resolve_impact
from ..terminology import (
    CATEGORY_CORE_WEB_VITALS,
    CATEGORY_PERFORMANCE,
)

def category_core_web_vitals() -> dict:
    """Core Web Vitals: not measured; recommend Lighthouse."""
    return {
        "id": "core_web_vitals",
        "name": CATEGORY_CORE_WEB_VITALS,
        "score": None,
        "issues": [_issue(
            "LCP, INP, and CLS are not measured by this crawl.",
            priority="Medium",
            recommendation="Run Lighthouse (PageSpeed Insights) from Run audit to measure Core Web Vitals.",
        )],
        "recommendations": ["Run Lighthouse from Run audit to measure LCP, INP, and CLS."],
    }


def category_core_web_vitals_from_lighthouse(
    lighthouse_summary: dict,
    crux_summary: Optional[dict] = None,
) -> dict:
    """Core Web Vitals from Lighthouse summary: score 0–100 from performance score, issues from top_failures."""
    issues = []
    recommendations = []
    perf_score = None
    mm = lighthouse_summary.get("median_metrics") or {}
    if isinstance(mm.get("performance_score"), (int, float)):
        perf_score = max(0, min(100, int(round(mm["performance_score"] * 100))))
    for f in lighthouse_summary.get("top_failures") or []:
        if not isinstance(f, dict):
            continue
        if not is_core_web_vitals_failure(f, resolve_impact=resolve_impact):
            continue
        aid = str(f.get("id") or "")
        title = str(f.get("title") or "")
        help_text = failure_help_text(f)
        msg = failure_display_message(f)
        entry = _resolve_entry(aid, title or None, help_text or None)
        rec = str(entry.get("one_line_fix") or "").strip()
        if not rec:
            rec = "See Lighthouse performance recommendations in this audit, or re-run Lighthouse from Run audit."
        issues.append(_issue(
            msg,
            priority="High" if (f.get("score") or 0) < 0.5 else "Medium",
            recommendation=rec,
        ))
    if not issues and perf_score is not None and perf_score < 80:
        recommendations.append("Improve Core Web Vitals (LCP, CLS, TBT) per Lighthouse recommendations.")
    if crux_summary and crux_summary.get("ok"):
        pw = crux_summary.get("pass") or {}
        for metric, label, rec in (
            ("lcp", "LCP", "Improve largest contentful paint (field data)."),
            ("inp", "INP", "Reduce interaction to next paint (field data)."),
            ("cls", "CLS", "Reduce cumulative layout shift (field data)."),
        ):
            if pw.get(metric) is False:
                issues.append(_issue(
                    f"CrUX field data: {label} does not pass Core Web Vitals threshold.",
                    priority="High",
                    recommendation=rec,
                ))
    return {
        "id": "core_web_vitals",
        "name": CATEGORY_CORE_WEB_VITALS,
        "score": perf_score,
        "issues": _sort_issues(issues),
        "recommendations": recommendations or ["Core Web Vitals measured by Lighthouse; see median_metrics in lighthouse_summary.json."],
    }


def category_performance(df: pd.DataFrame) -> dict:
    """Performance: response time, JS/CSS size, images, lazy loading, caching."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "performance", "name": CATEGORY_PERFORMANCE, "score": 0, "issues": [], "recommendations": []}

    if "response_time_ms" in success_df.columns:
        rt = pd.to_numeric(success_df["response_time_ms"], errors="coerce").fillna(0)
        slow = (rt > RESPONSE_TIME_SLOW_MS).sum()
        if slow > 0:
            issues.append(_issue(
                f"{int(slow)} page(s) have server response time > {RESPONSE_TIME_SLOW_MS // 1000}s.",
                priority="High" if slow > 5 else "Medium",
                recommendation="Optimize server response time (TTFB): caching, CDN, or backend tuning.",
            ))
            deductions.append((min(20, int(slow) * 2), True))
        valid_rt = rt[rt > 0]
        if len(valid_rt) > 5:
            p95 = float(valid_rt.quantile(0.95))
            if p95 > 3000:
                issues.append(_issue(
                    f"95th percentile response time is {int(p95)}ms (over 3s).",
                    priority="High",
                    recommendation="Investigate slowest pages; consider CDN, server-side caching, or database optimization.",
                ))
                deductions.append((10, True))

    if "images_total" in success_df.columns:
        total_imgs = success_df["images_total"].fillna(0).astype(int).sum()
        if total_imgs > 0 and "img_without_lazy" in success_df.columns:
            no_lazy = success_df["img_without_lazy"].fillna(0).astype(int).sum()
            if no_lazy > total_imgs * 0.5:
                issues.append(_issue(
                    "Many images without lazy loading.",
                    priority="Medium",
                    recommendation="Add loading='lazy' to off-screen images.",
                ))
                deductions.append((10, True))
        if total_imgs > 0 and "img_without_dimensions" in success_df.columns:
            no_dims = success_df["img_without_dimensions"].fillna(0).astype(int).sum()
            if no_dims > 0:
                issues.append(_issue(
                    f"{int(no_dims)} image(s) without width/height (can cause CLS).",
                    priority="High",
                    recommendation="Set width and height attributes on img tags to avoid layout shift.",
                ))
                deductions.append((10, True))

    if "cache_control" in success_df.columns:
        cache = success_df["cache_control"].fillna("").astype(str)
        no_cache = (cache.str.strip() == "").sum()
        if no_cache > len(success_df) * 0.5:
            issues.append(_issue(
                "Many pages without Cache-Control header.",
                priority="Medium",
                recommendation="Set Cache-Control (and optionally ETag) for static and cacheable pages.",
            ))
            deductions.append((10, True))

    if "script_count" in success_df.columns:
        scripts = success_df["script_count"].fillna(0).astype(int)
        if scripts.sum() > len(success_df) * 10:
            issues.append(_issue(
                "High number of script tags across pages.",
                priority="Low",
                recommendation="Consider bundling and code-splitting to reduce JS payload.",
            ))
            deductions.append((5, True))

    score = _score_deductions(100, deductions)
    return {
        "id": "performance",
        "name": CATEGORY_PERFORMANCE,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

