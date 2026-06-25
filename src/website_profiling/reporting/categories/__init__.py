"""Report categories for site audits."""
from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from .accessibility import category_html_accessibility, contrast_issues_from_sources
from .intelligence import category_intelligence
from .link_health import category_link_health
from .mobile import category_mobile
from .performance import (
    category_core_web_vitals,
    category_core_web_vitals_from_lighthouse,
    category_performance,
)
from .search_performance import category_search_performance
from .security import category_security
from .technical_seo import category_technical_seo
from ._helpers import (
    META_DESC_LEN_MAX,
    META_DESC_LEN_MIN,
    PRIORITY_ORDER,
    REDIRECT_CHAIN_LONG,
    RESPONSE_TIME_SLOW_MS,
    THIN_CONTENT_CHARS,
    TITLE_LEN_MAX,
    TITLE_LEN_MIN,
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
    merge_indexation_issues,
    merge_subdomain_issues,
)

__all__ = [
    "build_categories",
    "merge_indexation_issues",
    "merge_subdomain_issues",
    "category_technical_seo",
    "category_core_web_vitals",
    "category_core_web_vitals_from_lighthouse",
    "category_performance",
    "category_html_accessibility",
    "contrast_issues_from_sources",
    "category_link_health",
    "category_mobile",
    "category_security",
    "category_intelligence",
    "category_search_performance",
    "_issue",
    "_sort_issues",
    "_page_analysis_dict",
    "_broken_link_sources",
    "_hreflang_issues",
    "_schema_issues",
    "_soft_404_issues",
    "_indexation_coverage_issues",
    "_orphan_hub_suggestions",
    "REDIRECT_CHAIN_LONG",
    "PRIORITY_ORDER",
    "RESPONSE_TIME_SLOW_MS",
    "THIN_CONTENT_CHARS",
    "TITLE_LEN_MIN",
    "TITLE_LEN_MAX",
    "META_DESC_LEN_MIN",
    "META_DESC_LEN_MAX",
]

def build_categories(
    df: pd.DataFrame,
    edges: list[tuple[str, str]],
    summary_seo: dict,
    site_level: dict,
    start_url: str,
    security_findings: Optional[list[dict]] = None,
    lighthouse_summary: Optional[dict] = None,
    ml_bundle: Optional[dict] = None,
    crux_summary: Optional[dict] = None,
    lighthouse_by_url: Optional[dict[str, Any]] = None,
) -> list[dict]:
    """
    Build all category dicts with score, issues (with priority and recommendation), and recommendations.
    site_level should have: robots_present, sitemap_present, sitemap_valid (all optional).
    summary_seo should have: issues["broken"], issues["redirects"].
    security_findings: optional list from security scanner (finding_type, severity, url, message, recommendation).
    lighthouse_summary: optional dict from lighthouse_runner (median_metrics, top_failures); when set, Core Web Vitals uses real data.
    ml_bundle: optional dict from analysis + AI insights (duplicates, language_summary, etc.) for Content quality category.
    """
    issues_broken = summary_seo.get("issues", {}).get("broken", [])
    issues_redirects = summary_seo.get("issues", {}).get("redirects", [])

    cwv = (
        category_core_web_vitals_from_lighthouse(lighthouse_summary, crux_summary)
        if lighthouse_summary
        else category_core_web_vitals()
    )
    categories = [
        category_technical_seo(df, site_level),
        cwv,
        category_performance(df),
        category_html_accessibility(df, lighthouse_by_url=lighthouse_by_url),
        category_link_health(df, edges, issues_broken, issues_redirects),
        category_mobile(df),
        category_security(df, site_level, start_url or "", security_findings=security_findings),
        category_intelligence(ml_bundle),
    ]
    return categories
