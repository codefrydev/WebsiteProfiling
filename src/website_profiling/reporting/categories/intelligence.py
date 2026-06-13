"""Report category: intelligence."""
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
    CATEGORY_CONTENT_QUALITY,
)

def category_intelligence(ml_bundle: Optional[dict] = None) -> dict:
    """Content quality: duplicate clusters and language mix from crawl analysis and optional AI insights."""
    issues: list[dict] = []
    deductions: list[tuple[int, bool]] = []
    ml_bundle = ml_bundle or {}

    dups = ml_bundle.get("content_duplicates") or []
    if dups:
        big = [g for g in dups if (g.get("member_count") or len(g.get("member_urls") or [])) >= 3]
        if big:
            issues.append(_issue(
                f"Near-duplicate content: {len(big)} group(s) with 3+ URLs.",
                priority="High",
                recommendation="Consolidate or canonicalize duplicate pages; differentiate thin similar URLs.",
            ))
            deductions.append((min(20, 5 + len(big)), True))
        elif dups:
            issues.append(_issue(
                f"Possible duplicate content: {len(dups)} pair/group(s) detected.",
                priority="Medium",
                recommendation="Review clusters and add canonicals or noindex where appropriate.",
            ))
            deductions.append((8, True))

    lang = ml_bundle.get("language_summary") or {}
    if lang.get("mixed_site") and (lang.get("detected_pages") or 0) >= 10:
        counts = lang.get("counts") or {}
        top = sorted(counts.items(), key=lambda x: -x[1])[:3]
        desc = ", ".join(f"{k}:{v}" for k, v in top) if top else "multiple"
        issues.append(_issue(
            f"Mixed languages detected across pages ({desc}).",
            priority="Medium",
            recommendation="Ensure hreflang and localized URLs match user intent; split sitemaps if needed.",
        ))
        deductions.append((5, True))

    score = _score_deductions(100, deductions)
    return {
        "id": "intelligence",
        "name": CATEGORY_CONTENT_QUALITY,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }
