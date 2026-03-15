"""
Report categories: Technical SEO, Core Web Vitals, Performance, HTML/Accessibility,
Link Health, Mobile, Security. Each category has a score (0-100 or N/A), issues with
priority and recommended fixes, and category-level recommendations.
"""
from typing import Any, Optional
from urllib.parse import urlparse

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
REDIRECT_CHAIN_LONG = 2


def _issue(message: str, url: Optional[str] = None, priority: str = "Medium", recommendation: str = "") -> dict:
    return {"message": message, "url": url or "", "priority": priority, "recommendation": recommendation}


def _sort_issues(issues: list[dict]) -> list[dict]:
    return sorted(issues, key=lambda x: PRIORITY_ORDER.get(x.get("priority", "Low"), 99))


def _score_deductions(max_score: int, deductions: list[tuple[int, bool]]) -> int:
    """Return max(0, max_score - sum of deduction for each True)."""
    total = sum(d for d, apply in deductions if apply)
    return max(0, max_score - total)


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

    score = _score_deductions(100, deductions)
    return {
        "id": "technical_seo",
        "name": "Technical SEO",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def category_core_web_vitals() -> dict:
    """Core Web Vitals: not measured; recommend Lighthouse."""
    return {
        "id": "core_web_vitals",
        "name": "Core Web Vitals",
        "score": None,
        "issues": [_issue(
            "LCP, FID, and CLS are not measured by this tool.",
            priority="Medium",
            recommendation="Use Lighthouse or PageSpeed Insights to measure LCP, FID, and CLS.",
        )],
        "recommendations": ["Use Lighthouse or PageSpeed Insights to measure LCP, FID, and CLS."],
    }


def category_performance(df: pd.DataFrame) -> dict:
    """Performance: response time, JS/CSS size, images, lazy loading, caching."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "performance", "name": "Performance", "score": 0, "issues": [], "recommendations": []}

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
        "name": "Performance",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def category_html_accessibility(df: pd.DataFrame) -> dict:
    """HTML and Accessibility: semantic HTML, heading structure, alt, ARIA, contrast (stub)."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "html_accessibility", "name": "HTML & Accessibility", "score": 0, "issues": [], "recommendations": []}

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
                    issues.append(_issue(
                        "Skipped heading level (e.g. H1 then H3).",
                        url=str(row.get("url", "")),
                        priority="Medium",
                        recommendation="Use heading levels in order (H1, H2, H3) without skipping.",
                    ))
                    deductions.append((5, True))
                    break

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

    issues.append(_issue(
        "Color contrast is not measured by this tool.",
        priority="Low",
        recommendation="Use browser DevTools or axe to check contrast and accessibility.",
    ))

    score = _score_deductions(100, deductions)
    return {
        "id": "html_accessibility",
        "name": "HTML & Accessibility",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def category_link_health(
    df: pd.DataFrame,
    edges: list[tuple[str, str]],
    issues_broken: list[dict],
    issues_redirects: list[dict],
) -> dict:
    """Link Health: broken links, redirect chains, internal linking."""
    issues = []
    deductions = []

    for b in issues_broken[:30]:
        status = str(b.get("status", ""))
        priority = "Critical" if status.startswith("5") else "High"
        issues.append(_issue(
            f"Broken URL: {status}",
            url=b.get("url", ""),
            priority=priority,
            recommendation="Fix or remove the link; return 200 or redirect to a valid URL.",
        ))
    if issues_broken:
        deductions.append((min(30, len(issues_broken) * 2), True))

    for r in issues_redirects[:20]:
        issues.append(_issue(
            f"Redirect: {r.get('status', '')} to {r.get('final_url', '')}",
            url=r.get("url", ""),
            priority="Medium",
            recommendation="Prefer direct URLs or shorten redirect chains.",
        ))
    if issues_redirects:
        deductions.append((min(15, len(issues_redirects)), True))

    if "redirect_chain_length" in df.columns and len(df) > 0:
        rcl = pd.to_numeric(df["redirect_chain_length"], errors="coerce").fillna(0).astype(int)
        long_chains = (rcl >= REDIRECT_CHAIN_LONG).sum()
        if long_chains > 0:
            issues.append(_issue(
                f"{int(long_chains)} URL(s) have redirect chains (2+ hops).",
                priority="Medium",
                recommendation="Consolidate redirects to a single hop where possible.",
            ))
            deductions.append((min(10, int(long_chains)), True))

    if edges:
        import networkx as nx
        G = nx.DiGraph()
        G.add_edges_from(edges)
        in_deg = dict(G.in_degree())
        orphans = [n for n in G.nodes() if in_deg.get(n, 0) == 0]
        if len(orphans) > len(G.nodes()) * 0.3:
            issues.append(_issue(
                f"Many pages have no internal links pointing to them ({len(orphans)}).",
                priority="Low",
                recommendation="Add internal links to important pages to improve crawlability and PageRank.",
            ))
            deductions.append((5, True))

    score = _score_deductions(100, deductions)
    return {
        "id": "link_health",
        "name": "Link Health",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def category_mobile(df: pd.DataFrame) -> dict:
    """Mobile: viewport, responsive heuristic."""
    issues = []
    deductions = []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    if len(success_df) == 0:
        return {"id": "mobile", "name": "Mobile Optimization", "score": 0, "issues": [], "recommendations": []}

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
        "name": "Mobile Optimization",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def category_security(
    df: pd.DataFrame,
    site_level: dict,
    start_url: str,
) -> dict:
    """Security: HTTPS, security headers, mixed content."""
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

    score = _score_deductions(100, deductions)
    return {
        "id": "security",
        "name": "Security",
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }


def build_categories(
    df: pd.DataFrame,
    edges: list[tuple[str, str]],
    summary_seo: dict,
    site_level: dict,
    start_url: str,
) -> list[dict]:
    """
    Build all category dicts with score, issues (with priority and recommendation), and recommendations.
    site_level should have: robots_present, sitemap_present, sitemap_valid (all optional).
    summary_seo should have: issues["broken"], issues["redirects"].
    """
    issues_broken = summary_seo.get("issues", {}).get("broken", [])
    issues_redirects = summary_seo.get("issues", {}).get("redirects", [])

    categories = [
        category_technical_seo(df, site_level),
        category_core_web_vitals(),
        category_performance(df),
        category_html_accessibility(df),
        category_link_health(df, edges, issues_broken, issues_redirects),
        category_mobile(df),
        category_security(df, site_level, start_url or ""),
    ]
    return categories
