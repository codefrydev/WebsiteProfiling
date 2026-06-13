"""Report category: accessibility."""
from __future__ import annotations

import json
from typing import Any, Optional

import pandas as pd

from ..terminology import CATEGORY_ACCESSIBILITY
from ._helpers import (
    _issue,
    _page_analysis_dict,
    _parse_page_analysis_cell,
    _score_deductions,
    _sort_issues,
)

def contrast_issues_from_sources(
    df: pd.DataFrame,
    lighthouse_by_url: Optional[dict[str, Any]] = None,
) -> list[dict]:
    """Contrast issues from axe crawl data and per-URL Lighthouse failures."""
    issues: list[dict] = []
    seen_urls: set[str] = set()

    if df is not None and not df.empty and "page_analysis" in df.columns:
        for _, row in df.iterrows():
            url = str(row.get("url") or "").strip()
            if not url:
                continue
            pa = _parse_page_analysis_cell(row.get("page_analysis"))
            axe = pa.get("axe_violations")
            if not isinstance(axe, list):
                continue
            contrast_hits = [
                v for v in axe
                if isinstance(v, dict) and "color-contrast" in str(v.get("id") or "")
            ]
            if not contrast_hits:
                continue
            seen_urls.add(url.rstrip("/"))
            first = contrast_hits[0]
            msg = str(first.get("description") or first.get("help") or "Color contrast violation")
            issues.append(_issue(
                f"axe: {msg}",
                url=url,
                priority="Medium",
                recommendation=str(
                    first.get("help")
                    or "Fix text/background contrast to meet WCAG AA (axe-core)."
                ),
            ))

    lh_map = lighthouse_by_url or {}
    for url, summary in lh_map.items():
        if not isinstance(summary, dict):
            continue
        u = str(url or summary.get("url") or "").strip().rstrip("/")
        if not u or u in seen_urls:
            continue
        for fail in summary.get("top_failures") or []:
            if not isinstance(fail, dict):
                continue
            if str(fail.get("id") or "") != "color-contrast":
                continue
            seen_urls.add(u)
            help_text = str(fail.get("helpText") or "Low color contrast")
            issues.append(_issue(
                f"Lighthouse: {help_text}",
                url=u,
                priority="Medium",
                recommendation="Increase contrast ratio between text and background to meet WCAG AA.",
            ))
            break

    return issues[:40]


def category_html_accessibility(
    df: pd.DataFrame,
    lighthouse_by_url: Optional[dict[str, Any]] = None,
) -> dict:
    """HTML and Accessibility: semantic HTML, heading structure, alt, ARIA, contrast."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "html_accessibility", "name": CATEGORY_ACCESSIBILITY, "score": 0, "issues": [], "recommendations": []}

    if "h1_count" in df.columns:
        h1c = pd.to_numeric(success_df["h1_count"], errors="coerce").fillna(-1).astype(int)
        zero_h1 = (h1c == 0).sum()
        multi_h1 = (h1c > 1).sum()
        if zero_h1 > 0:
            issues.append(_issue(
                f"{int(zero_h1)} page(s) missing H1.",
                priority="High",
                recommendation="Add exactly one H1 per page describing the main content.",
            ))
            deductions.append((min(20, int(zero_h1) * 3), True))
        if multi_h1 > 0:
            issues.append(_issue(
                f"{int(multi_h1)} page(s) have multiple H1s.",
                priority="Medium",
                recommendation="Use a single H1 per page; use H2–H6 for subsections.",
            ))
            deductions.append((min(10, int(multi_h1) * 2), True))

    if "heading_sequence" in df.columns:
        pages_with_skipped_heading = 0
        for _, row in success_df.iterrows():
            seq = row.get("heading_sequence")
            if pd.isna(seq) or not str(seq).strip():
                continue
            parts = [p.strip() for p in str(seq).split(",") if p.strip()]
            if not parts:
                continue
            levels = [int(h[1]) for h in parts if len(h) == 2 and h[0] == "h" and h[1] in "123456"]
            for i in range(1, len(levels)):
                if levels[i] > levels[i - 1] + 1:
                    if pages_with_skipped_heading == 0:
                        issues.append(_issue(
                            "Skipped heading level (e.g. H1 then H3).",
                            url=str(row.get("url", "")),
                            priority="Medium",
                            recommendation="Use heading levels in order (H1, H2, H3) without skipping.",
                        ))
                    pages_with_skipped_heading += 1
                    break
        if pages_with_skipped_heading > 0:
            deductions.append((min(15, pages_with_skipped_heading * 5), True))

    if "images_total" in df.columns and "images_without_alt" in df.columns:
        total = success_df["images_total"].fillna(0).astype(int).sum()
        missing_alt = success_df["images_without_alt"].fillna(0).astype(int).sum()
        if total > 0 and missing_alt > 0:
            issues.append(_issue(
                f"{int(missing_alt)} image(s) without alt (or aria-label).",
                priority="High",
                recommendation="Add meaningful alt text to all images; use alt='' for decorative images.",
            ))
            deductions.append((min(15, int(missing_alt) * 2), True))

    if "word_count" in success_df.columns:
        wc = pd.to_numeric(success_df["word_count"], errors="coerce").fillna(0).astype(int)
        very_thin = int(((wc > 0) & (wc < 100)).sum())
        if very_thin > 0:
            issues.append(_issue(
                f"{very_thin} page(s) with very thin content (under 100 words).",
                priority="High",
                recommendation="Expand thin pages with meaningful content (aim for 300+ words).",
            ))
            deductions.append((min(15, very_thin * 3), True))

    if "reading_level" in success_df.columns:
        rl = pd.to_numeric(success_df["reading_level"], errors="coerce").fillna(0)
        complex_pages = int((rl > 14).sum())
        if complex_pages > 0:
            issues.append(_issue(
                f"{complex_pages} page(s) have very complex content (reading level > 14).",
                priority="Medium",
                recommendation="Simplify language for broader audience accessibility (aim for grade 8-10).",
            ))
            deductions.append((min(10, complex_pages * 2), True))

    contrast_issues = contrast_issues_from_sources(df, lighthouse_by_url)
    if contrast_issues:
        issues.extend(contrast_issues)
        deductions.append((min(25, len(contrast_issues) * 4), True))
    else:
        issues.append(_issue(
            "Color contrast is not measured by this tool.",
            priority="Low",
            recommendation="Enable axe (browser crawl) or Lighthouse to check contrast.",
        ))

    score = _score_deductions(100, deductions)
    if len(success_df) > 0 and score == 0:
        score = 5
    score = min(100, max(0, score))
    return {
        "id": "html_accessibility",
        "name": CATEGORY_ACCESSIBILITY,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

