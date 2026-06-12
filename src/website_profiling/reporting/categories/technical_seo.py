"""Report category: technical_seo."""
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
    CATEGORY_TECHNICAL_SEO,
)

def category_technical_seo(
    df: pd.DataFrame,
    site_level: dict,
) -> dict:
    """Technical SEO: robots, sitemap, canonical, duplicate content, noindex, schema."""
    issues = []
    deductions = []
    total = len(df)
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()

    if not site_level.get("robots_present", True):
        issues.append(_issue(
            "robots.txt is missing or unreachable.",
            priority="High",
            recommendation="Add a robots.txt at the site root to control crawler access.",
        ))
        deductions.append((15, True))
    if not site_level.get("sitemap_present", True):
        issues.append(_issue(
            "sitemap.xml (or sitemap index) is missing or unreachable.",
            priority="High",
            recommendation="Add a sitemap at /sitemap.xml or link it in robots.txt.",
        ))
        deductions.append((10, True))
    if site_level.get("sitemap_present") and not site_level.get("sitemap_valid", True):
        issues.append(_issue(
            "sitemap.xml could not be parsed as valid XML.",
            priority="Medium",
            recommendation="Ensure sitemap is valid XML and follows sitemaps.org format.",
        ))
        deductions.append((5, True))
    if site_level.get("ads_txt_present") is False:
        issues.append(_issue(
            "ads.txt is missing or unreachable.",
            priority="Low",
            recommendation="Add an ads.txt file at the site root if you run programmatic advertising.",
        ))
    if site_level.get("security_txt_present") is False:
        issues.append(_issue(
            "security.txt is missing or unreachable.",
            priority="Low",
            recommendation="Publish security.txt at /.well-known/security.txt with a Contact field for security reporting.",
        ))

    # Canonical: missing or self-mismatch
    if "canonical_url" in df.columns and len(success_df) > 0:
        for _, row in success_df.iterrows():
            url = row.get("url")
            canon = row.get("canonical_url")
            if pd.isna(url):
                continue
            url = str(url).strip()
            canon = "" if pd.isna(canon) else str(canon).strip()
            if not canon:
                issues.append(_issue("Missing canonical URL.", url=url, priority="Medium", recommendation="Add a canonical link tag pointing to the preferred URL."))
                break
        missing_canon = success_df["canonical_url"].fillna("").astype(str).str.strip().eq("").sum()
        if missing_canon > 0:
            deductions.append((min(15, missing_canon * 2), True))
        # Self-canonical mismatch: canonical points to different URL
        for _, row in success_df.iterrows():
            url = row.get("url")
            canon = row.get("canonical_url")
            if pd.isna(url) or pd.isna(canon) or not str(canon).strip():
                continue
            url = str(url).rstrip("/")
            canon = str(canon).strip().rstrip("/")
            if url != canon:
                issues.append(_issue(f"Canonical points to different URL: {canon}", url=url, priority="High", recommendation="Set canonical to this page URL or the preferred duplicate."))
                deductions.append((10, True))
                break

    # Noindex on important pages (CSV may store True/False as strings)
    if "noindex" in df.columns and len(success_df) > 0:
        noindex_ser = success_df["noindex"].astype(str).str.lower().isin(("true", "1", "yes"))
        noindex_count = int(noindex_ser.sum())
        if noindex_count > 0:
            issues.append(_issue(
                f"{int(noindex_count)} page(s) have noindex.",
                priority="High" if noindex_count > 5 else "Medium",
                recommendation="Remove noindex from pages that should be indexed, or keep for intentional no-index pages.",
            ))
            deductions.append((min(15, noindex_count * 3), True))

    # Duplicate content heuristic: same title + meta description
    if "title" in df.columns and "meta_description" in df.columns and len(success_df) > 1:
        key = success_df["title"].fillna("").astype(str) + "|" + success_df["meta_description"].fillna("").astype(str)
        dupes = key.value_counts()
        dupes = dupes[dupes > 1]
        if len(dupes) > 0:
            issues.append(_issue(
                f"Possible duplicate content: {len(dupes)} group(s) of pages share same title and meta description.",
                priority="Medium",
                recommendation="Differentiate titles and meta descriptions, or use canonicals to designate the preferred URL.",
            ))
            deductions.append((10, True))

    # Social meta tags
    if "og_title" in df.columns and len(success_df) > 0:
        og_present = (success_df["og_title"].fillna("").astype(str).str.strip() != "").sum()
        og_pct = og_present / len(success_df) if len(success_df) > 0 else 1
        if og_pct < 0.5:
            issues.append(_issue(
                f"Open Graph tags missing on {int((1 - og_pct) * 100)}% of pages.",
                priority="Medium",
                recommendation="Add og:title, og:description, and og:image meta tags for social sharing.",
            ))
            deductions.append((5, True))

    if "twitter_card" in df.columns and len(success_df) > 0:
        tw_present = (success_df["twitter_card"].fillna("").astype(str).str.strip() != "").sum()
        tw_pct = tw_present / len(success_df) if len(success_df) > 0 else 1
        if tw_pct < 0.2:
            issues.append(_issue(
                f"Twitter Card tags missing on {int((1 - tw_pct) * 100)}% of pages.",
                priority="Low",
                recommendation="Add twitter:card meta tags for better Twitter/X sharing previews.",
            ))
            deductions.append((3, True))

    # Structured data
    if "has_schema" in df.columns and len(success_df) > 0:
        with_schema = int(success_df["has_schema"].astype(str).str.lower().isin(("true", "1", "yes")).sum())
        if with_schema == 0:
            issues.append(_issue(
                "No structured data (JSON-LD or microdata) detected.",
                priority="Low",
                recommendation="Add schema.org markup (e.g. Organization, Article) for rich results.",
            ))
            deductions.append((5, True))

    # Internationalization: <html lang> from page_analysis (re-crawl to populate)
    if "page_analysis" in df.columns and len(success_df) > 0:
        missing_lang = 0
        for _, row in success_df.iterrows():
            pa = _page_analysis_dict(row)
            if not (pa.get("html_lang") or "").strip():
                missing_lang += 1
        if missing_lang > 0 and len(success_df) >= 3:
            ratio = missing_lang / len(success_df)
            if ratio > 0.1:
                issues.append(_issue(
                    f"{missing_lang} page(s) missing <html lang> (of {len(success_df)} OK responses).",
                    priority="Medium" if ratio > 0.5 else "Low",
                    recommendation="Add <html lang=\"...\"> matching the primary language of each page.",
                ))
                deductions.append((min(10, max(2, missing_lang // 5)), True))

    issues.extend(_hreflang_issues(success_df))
    issues.extend(_schema_issues(success_df))
    issues.extend(_soft_404_issues(success_df))

    if "page_analysis" in df.columns and len(success_df) > 0:
        from ...crawl.fetchers.browser_diagnostics import browser_summary_from_page_analysis

        pages_with_console = 0
        for _, row in success_df.iterrows():
            pa = _page_analysis_dict(row)
            counts = browser_summary_from_page_analysis(pa)
            url = str(row.get("url") or "").strip()
            if counts["console_error_count"] > 0:
                pages_with_console += 1
            if counts["page_error_count"] > 0 and url:
                issues.append(_issue(
                    "Uncaught JavaScript error during browser render.",
                    url=url,
                    priority="High",
                    recommendation="Fix runtime JS errors that may break page functionality or SEO signals.",
                ))
                deductions.append((5, True))
        if pages_with_console > 0:
            issues.append(_issue(
                f"{pages_with_console} page(s) logged console errors during JavaScript rendering.",
                priority="High" if pages_with_console > 3 else "Medium",
                recommendation="Inspect browser console errors on affected URLs; fix broken scripts or API calls.",
            ))
            deductions.append((min(15, pages_with_console * 2), True))

    score = _score_deductions(100, deductions)
    return {
        "id": "technical_seo",
        "name": CATEGORY_TECHNICAL_SEO,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

