"""Report category: mobile."""
from __future__ import annotations

from typing import Any, Optional

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
    CATEGORY_MOBILE,
)

def category_mobile(df: pd.DataFrame) -> dict:
    """Mobile: viewport, responsive heuristic."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "mobile", "name": CATEGORY_MOBILE, "score": 0, "issues": [], "recommendations": []}

    if "viewport_present" in df.columns:
        viewport_ok = success_df["viewport_present"].astype(str).str.lower().isin(("true", "1", "yes"))
        no_viewport = int((~viewport_ok).sum())
        if no_viewport > 0:
            issues.append(_issue(
                f"{int(no_viewport)} page(s) missing viewport meta tag.",
                priority="Critical",
                recommendation="Add <meta name='viewport' content='width=device-width, initial-scale=1'>.",
            ))
            deductions.append((min(25, int(no_viewport) * 5), True))
        viewport_content = success_df["viewport_content"].fillna("").astype(str)
        viewport_ok = success_df["viewport_present"].astype(str).str.lower().isin(("true", "1", "yes"))
        invalid = (viewport_content.str.strip().eq("") | (~viewport_content.str.contains("width|device-width", case=False, na=False))) & viewport_ok
        if invalid.sum() > 0:
            issues.append(_issue(
                "Some pages have viewport without width or device-width.",
                priority="High",
                recommendation="Use content='width=device-width, initial-scale=1' (or similar).",
            ))
            deductions.append((10, True))

    score = _score_deductions(100, deductions)
    return {
        "id": "mobile",
        "name": CATEGORY_MOBILE,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

