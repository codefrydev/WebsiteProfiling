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

    if security_findings:
        for f in security_findings:
            severity = f.get("severity", "Medium")
            issue = _issue(
                f.get("message", ""),
                url=f.get("url", ""),
                priority=severity,
                recommendation=f.get("recommendation", ""),
            )
            finding_type = f.get("finding_type")
            if finding_type:
                issue["finding_type"] = finding_type
            issues.append(issue)
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

