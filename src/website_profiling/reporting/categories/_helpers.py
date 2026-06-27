"""Shared helpers for report category builders."""
from __future__ import annotations

import json
from typing import Any, Optional

import pandas as pd

# Priority order for sorting
PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}

# Thresholds
RESPONSE_TIME_SLOW_MS = 2000
THIN_CONTENT_CHARS = 300
TITLE_LEN_MIN = 30
TITLE_LEN_MAX = 60
META_DESC_LEN_MIN = 70
META_DESC_LEN_MAX = 160
REDIRECT_CHAIN_LONG = 3
MAX_ISSUES_PER_CHECK = 20
MAX_HREFLANG_ISSUES_PER_CHECK = 15


def _issue(message: str, url: Optional[str] = None, priority: str = "Medium", recommendation: str = "") -> dict:
    return {"message": message, "url": url or "", "priority": priority, "recommendation": recommendation}


def _sort_issues(issues: list[dict]) -> list[dict]:
    return sorted(issues, key=lambda x: PRIORITY_ORDER.get(x.get("priority", "Low"), 99))


def _page_analysis_dict(row: pd.Series) -> dict:
    """Parse page_analysis JSON cell from a crawl row."""
    import json

    raw = row.get("page_analysis")
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return {}
    s = str(raw).strip()
    if not s or s == "{}":
        return {}
    try:
        o = json.loads(s)
        return o if isinstance(o, dict) else {}
    except json.JSONDecodeError:
        return {}


def _score_deductions(max_score: int, deductions: list[tuple[int, bool]]) -> int:
    """Return max(0, max_score - sum of deduction for each True)."""
    total = sum(d for d, apply in deductions if apply)
    return max(0, max_score - total)


def _hreflang_issues(success_df: pd.DataFrame) -> list[dict]:
    """Hreflang cluster consistency (return tags, self-reference)."""
    issues: list[dict] = []
    if "page_analysis" not in success_df.columns:
        return issues
    duplicate_count = 0
    self_ref_count = 0
    for _, row in success_df.iterrows():
        pa = _page_analysis_dict(row)
        alts = pa.get("hreflang_alternates") or []
        if not alts:
            continue
        url = str(row.get("url") or "").strip()
        langs = [str(a.get("hreflang") or a.get("lang") or "").strip().lower() for a in alts if isinstance(a, dict)]
        hrefs = [str(a.get("href") or "").strip() for a in alts if isinstance(a, dict)]
        if langs and len(set(langs)) < len(langs):
            if duplicate_count < MAX_HREFLANG_ISSUES_PER_CHECK:
                issues.append(_issue(
                    "Duplicate hreflang language codes on page.",
                    url=url,
                    priority="High",
                    recommendation="Each hreflang alternate should use a unique language/region code.",
                ))
                duplicate_count += 1
        if url and hrefs and url.rstrip("/") not in [h.rstrip("/") for h in hrefs]:
            if self_ref_count < MAX_HREFLANG_ISSUES_PER_CHECK:
                issues.append(_issue(
                    "Hreflang cluster missing self-referencing alternate.",
                    url=url,
                    priority="Medium",
                    recommendation="Include a hreflang link pointing to this page URL.",
                ))
                self_ref_count += 1
    return issues


def _schema_issues(success_df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    invalid = 0
    for _, row in success_df.iterrows():
        pa = _page_analysis_dict(row)
        schemas = pa.get("json_ld_types") or pa.get("schema_types") or []
        if isinstance(schemas, str):
            schemas = [schemas]
        url = str(row.get("url") or "").strip()
        has_schema = str(row.get("has_schema", "")).lower() in ("true", "1", "yes")
        if has_schema and not schemas:
            invalid += 1
            if invalid == 1:
                issues.append(_issue(
                    "Structured data present but could not parse JSON-LD @type.",
                    url=url,
                    priority="Low",
                    recommendation="Validate JSON-LD with Google Rich Results Test.",
                ))
    return issues


def _soft_404_issues(success_df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    markers = ("not found", "404", "page not found", "doesn't exist", "does not exist")
    for _, row in success_df.iterrows():
        title = str(row.get("title") or "").lower()
        if any(m in title for m in markers):
            url = str(row.get("url") or "").strip()
            issues.append(_issue(
                "Possible soft 404: page returns 200 but title suggests not found.",
                url=url,
                priority="High",
                recommendation="Return 404 status or redirect to a relevant page.",
            ))
            if len(issues) >= 10:
                break
    return issues


def _broken_link_sources(edges: list[tuple[str, str]], broken_urls: set[str]) -> list[dict]:
    """Issues listing which pages link to broken URLs."""
    issues: list[dict] = []
    if not broken_urls:
        return issues
    sources: dict[str, list[str]] = {}
    for src, tgt in edges:
        if tgt in broken_urls:
            sources.setdefault(tgt, []).append(src)
    for tgt, srcs in list(sources.items())[:15]:
        sample = ", ".join(srcs[:3])
        more = f" (+{len(srcs) - 3} more)" if len(srcs) > 3 else ""
        issues.append(_issue(
            f"Broken URL linked from {len(srcs)} page(s): {sample}{more}",
            url=tgt,
            priority="High",
            recommendation="Fix or remove links pointing to this URL.",
        ))
    return issues


def _indexation_coverage_issues(
    df: pd.DataFrame,
    indexation: dict | None,
) -> list[dict]:
    """Sitemap vs crawl mismatches and noindex URLs listed in sitemap."""
    issues: list[dict] = []
    if not indexation:
        return issues
    lists = indexation.get("lists") if isinstance(indexation.get("lists"), dict) else {}
    sitemap_only = lists.get("sitemap_only") or []
    for url in sitemap_only[:15]:
        issues.append(_issue(
            f"URL in sitemap but not crawled: {url}",
            url=str(url),
            priority="High",
            recommendation="Verify the URL is linked internally, not blocked by robots, and within crawl scope.",
        ))
    sitemap_urls = indexation.get("sitemap_urls") or []
    if sitemap_urls and "noindex" in df.columns:
        from ...integrations.google.normalize import normalize_url

        sitemap_norm = {normalize_url(u) for u in sitemap_urls}
        success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
        noindex_in_sitemap = 0
        for _, row in success.iterrows():
            if noindex_in_sitemap >= 15:
                break
            url = str(row.get("url") or "").strip()
            if not url:
                continue
            noindex = str(row.get("noindex") or "").lower() in ("true", "1", "yes")
            if noindex and normalize_url(url) in sitemap_norm:
                issues.append(_issue(
                    "Page has noindex but is listed in XML sitemap.",
                    url=url,
                    priority="Critical",
                    recommendation="Remove the URL from the sitemap or remove noindex if the page should be indexed.",
                ))
                noindex_in_sitemap += 1
    return issues


def merge_indexation_issues(categories: list[dict], df: pd.DataFrame, indexation: dict | None) -> None:
    """Append indexation coverage issues to the technical SEO category."""
    extra = _indexation_coverage_issues(df, indexation)
    if not extra:
        return
    for cat in categories:
        if cat.get("id") == "technical_seo":
            cat["issues"] = _sort_issues((cat.get("issues") or []) + extra)
            recs = {i["recommendation"] for i in cat["issues"] if i.get("recommendation")}
            cat["recommendations"] = list(recs)
            break


def merge_subdomain_issues(categories: list[dict], subdomains: dict | None) -> None:
    """Append GSC subdomain gap summary to technical SEO."""
    if not subdomains or subdomains.get("disabled"):
        return
    hosts = subdomains.get("gsc_hosts_not_crawled") or []
    if not hosts:
        return
    preview = ", ".join(hosts[:5])
    suffix = f" (+{len(hosts) - 5} more)" if len(hosts) > 5 else ""
    msg = f"GSC shows URLs on subdomain(s) not reached by crawl: {preview}{suffix}."
    issue = _issue(
        msg,
        priority="Medium",
        recommendation="Include these hosts in crawl scope or verify they are intentional separate properties.",
    )
    for cat in categories:
        if cat.get("id") == "technical_seo":
            cat["issues"] = _sort_issues((cat.get("issues") or []) + [issue])
            recs = {i["recommendation"] for i in cat["issues"] if i.get("recommendation")}
            cat["recommendations"] = list(recs)
            break


def _orphan_hub_suggestions(edges: list[tuple[str, str]], orphan_urls: list[str]) -> list[dict]:
    issues: list[dict] = []
    if not edges or not orphan_urls:
        return issues
    in_deg: dict[str, int] = {}
    out_from: dict[str, list[str]] = {}
    for src, tgt in edges:
        in_deg[tgt] = in_deg.get(tgt, 0) + 1
        out_from.setdefault(src, []).append(tgt)
    hubs = sorted(in_deg.keys(), key=lambda u: -in_deg.get(u, 0))[:5]
    hub_label = hubs[0] if hubs else ""
    for orphan in orphan_urls[:10]:
        issues.append(_issue(
            f"Orphan page (no inlinks). Consider linking from hub page: {hub_label}" if hub_label else "Orphan page (no inlinks).",
            url=orphan,
            priority="Medium",
            recommendation="Add internal links from category or hub pages to this URL.",
        ))
    return issues


def _parse_page_analysis_cell(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw or not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}

