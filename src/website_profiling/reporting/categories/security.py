"""Report category: security."""
from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd

from ._helpers import (
    PRIORITY_ORDER,
    _broken_link_sources,
    _hreflang_issues,
    _indexation_coverage_issues,
    _issue,
    _orphan_hub_suggestions,
    _page_analysis_dict,
    _schema_issues,
    _score_deductions,
    _soft_404_issues,
    _sort_issues,
)
from ..terminology import (
    CATEGORY_SECURITY,
)

def category_security(
    df: pd.DataFrame,
    site_level: dict,
    start_url: str,
    security_findings: Optional[list[dict]] = None,
) -> dict:
    """Security: HTTPS, security headers, mixed content, and optional vulnerability scan findings."""
    issues = []
    deductions = []
    parsed = urlparse(start_url)
    if parsed.scheme and parsed.scheme.lower() != "https":
        issues.append(_issue(
            "Site is not using HTTPS.",
            url=start_url,
            priority="Critical",
            recommendation="Serve the site over HTTPS and redirect HTTP to HTTPS.",
        ))
        deductions.append((30, True))

    if "final_url" in df.columns and len(df) > 0:
        final_urls = df["final_url"].fillna("").astype(str)
        http_finals = final_urls.str.strip().str.lower().str.startswith("http://")
        if http_finals.sum() > 0:
            issues.append(_issue(
                f"{int(http_finals.sum())} URL(s) resolve to HTTP.",
                priority="Critical",
                recommendation="Ensure all pages redirect to HTTPS.",
            ))
            deductions.append((20, True))

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) > 0:
        # Security headers: sample from first row or aggregate (optional columns)
        missing_hsts = (success_df["strict_transport_security"].fillna("").astype(str).str.strip() == "").sum() if "strict_transport_security" in success_df.columns else len(success_df)
        missing_xcto = (success_df["x_content_type_options"].fillna("").astype(str).str.strip() == "").sum() if "x_content_type_options" in success_df.columns else len(success_df)
        missing_xfo = (success_df["x_frame_options"].fillna("").astype(str).str.strip() == "").sum() if "x_frame_options" in success_df.columns else len(success_df)
        if missing_hsts >= len(success_df) * 0.5:
            issues.append(_issue(
                "Strict-Transport-Security header not set.",
                priority="High",
                recommendation="Add Strict-Transport-Security to enforce HTTPS.",
            ))
            deductions.append((15, True))
        if missing_xcto >= len(success_df) * 0.5:
            issues.append(_issue(
                "X-Content-Type-Options header not set.",
                priority="Medium",
                recommendation="Add X-Content-Type-Options: nosniff.",
            ))
            deductions.append((5, True))
        if missing_xfo >= len(success_df) * 0.5:
            issues.append(_issue(
                "X-Frame-Options header not set.",
                priority="Medium",
                recommendation="Add X-Frame-Options: DENY or SAMEORIGIN.",
            ))
            deductions.append((5, True))

    if "mixed_content_count" in success_df.columns:
        mixed = success_df["mixed_content_count"].fillna(0).astype(int).sum()
        scheme = (parsed.scheme or "").lower()
        if mixed > 0 and scheme == "https":
            issues.append(_issue(
                f"Mixed content: {int(mixed)} HTTP resource(s) on HTTPS pages.",
                priority="High",
                recommendation="Load all resources over HTTPS to avoid mixed content.",
            ))
            deductions.append((15, True))

    # Merge vulnerability scan findings (same format as issues: message, url, priority, recommendation)
    if security_findings:
        for f in security_findings:
            severity = f.get("severity", "Medium")
            issues.append(_issue(
                f.get("message", ""),
                url=f.get("url", ""),
                priority=severity,
                recommendation=f.get("recommendation", ""),
            ))
            # Deduct by severity: Critical 15, High 10, Medium 5, Low 2
            ded = {"Critical": 15, "High": 10, "Medium": 5, "Low": 2}.get(severity, 2)
            deductions.append((min(ded, 15), True))

    score = _score_deductions(100, deductions)
    return {
        "id": "security",
        "name": CATEGORY_SECURITY,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

