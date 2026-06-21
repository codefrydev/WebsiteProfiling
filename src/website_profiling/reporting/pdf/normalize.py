"""Issue normalization and grouping for PDF output.

Transforms raw ``_issues_rows`` dicts (which mirror the DB payload) into
``PdfIssue`` objects suited for print layout:
- Strips duplicated URLs from headlines
- Expands Lighthouse audit-id abbreviations into human labels
- Groups by priority → category for use by IssueGroupBlock
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Optional
from urllib.parse import urlparse

from .document import IssueGroupBlock, PdfIssue, PdfIssueMetrics, PdfTruncation

# ---------------------------------------------------------------------------
# Lighthouse audit-id → human label registry
# ---------------------------------------------------------------------------

_LH_AUDIT_LABELS: dict[str, str] = {
    "cache-insight": "Serve assets with efficient cache policy",
    "color-contrast": "Background and foreground colors lack sufficient contrast",
    "unused-css-rules": "Remove unused CSS",
    "errors-in-console": "Browser errors logged to the console",
    "label-content-name-mismatch": "Button/link label does not match accessible name",
    "network-dependency-tree-insight": "Minimize critical request chain depth",
    "render-blocking-insight": "Eliminate render-blocking resources",
    "unused-javascript": "Remove unused JavaScript",
    "uses-optimized-images": "Efficiently encode images",
    "uses-responsive-images": "Properly size images",
    "uses-webp-images": "Serve images in next-gen formats",
    "largest-contentful-paint-element": "Largest Contentful Paint element",
    "total-blocking-time": "Total Blocking Time",
    "cumulative-layout-shift": "Cumulative Layout Shift",
    "first-contentful-paint": "First Contentful Paint",
    "speed-index": "Speed Index",
    "interactive": "Time to Interactive",
    "server-response-time": "Reduce initial server response time",
    "dom-size": "Avoid an excessive DOM size",
    "long-tasks": "Avoid long main-thread tasks",
    "layout-shifts": "Avoid large layout shifts",
    "image-alt": "Image elements do not have alt attributes",
    "link-name": "Links do not have a discernible name",
    "button-name": "Buttons do not have an accessible name",
    "duplicate-id-active": "Document has active focus elements with duplicate ID",
    "heading-order": "Heading elements are not in a sequentially-descending order",
    "meta-description": "Document does not have a meta description",
    "document-title": "Document does not have a <title> element",
    "hreflang": "Document does not have a valid hreflang",
    "canonical": "Page is not canonical",
    "robots-txt": "Robots.txt is not valid",
    "tap-targets": "Touch targets are not sized appropriately",
}

_URL_IN_MSG_PATTERN = re.compile(
    r"(https?://\S+|(?:^|[\s:])(/\S+))", re.IGNORECASE
)

# Colon at end of a known-bad audit id: "cache-insight:" → strip colon
_AUDIT_ID_TRAILING_COLON = re.compile(r"^([\w-]+):$")


def _lh_label(audit_id: str) -> str:
    """Return a human-readable label for a Lighthouse audit id."""
    clean = audit_id.rstrip(":").strip().lower()
    return _LH_AUDIT_LABELS.get(clean, clean.replace("-", " ").title())


def _strip_url_from_headline(message: str, url: str) -> str:
    """Remove URL from message text when it duplicates the dedicated url field."""
    if not url or not message:
        return message

    # Direct inclusion: "Issue text: https://example.com/path"
    stripped = message.replace(url, "").strip().rstrip(":").strip()
    if stripped and stripped != message:
        return stripped

    # URL with trailing slash variant
    url_slash = url.rstrip("/") + "/"
    stripped2 = message.replace(url_slash, "").strip().rstrip(":").strip()
    if stripped2 and stripped2 != message:
        return stripped2

    return message


def _extract_path(url: str) -> Optional[str]:
    """Return just the path component of a URL for compact display."""
    if not url:
        return None
    try:
        parsed = urlparse(url)
        return parsed.path or None
    except Exception:
        return None


def _is_lighthouse_row(message: str, tags: list[str]) -> tuple[bool, str]:
    """Detect Lighthouse issue rows and return (is_lh, audit_id)."""
    # Pattern: "audit-id:" alone or at start of message
    m = _AUDIT_ID_TRAILING_COLON.match(message.strip())
    if m:
        return True, m.group(1)
    # Tag-based
    if "lighthouse" in tags:
        return True, ""
    return False, ""


def _issue_id(row: dict[str, Any]) -> str:
    key = f"{row.get('category','')}\x00{row.get('priority','')}\x00{row.get('message','')}\x00{row.get('url','')}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _shorten_headline(headline: str, raw_message: str, url: str) -> str:
    """Apply common headline cleanups after URL strip / lighthouse expansion."""
    lower = headline.lower()
    lower_raw = raw_message.lower()

    if "url in sitemap but not crawled" in lower:
        return "In sitemap, not crawled"

    if lower_raw.startswith("redirect:"):
        m = re.match(r"redirect:\s*(\d{3})\s*to\b", lower_raw)
        if m:
            return f"{m.group(1)} redirect"

    if lower.startswith("lighthouse:"):
        return headline.split(":", 1)[-1].strip()

    if lower.startswith("axe:"):
        body = headline.split(":", 1)[-1].strip()
        if len(body) > 90:
            dot = body.find(". ")
            if dot > 0:
                body = body[: dot + 1]
            else:
                body = body[:87].rsplit(" ", 1)[0] + "…"
        return body

    if len(headline) > 100:
        return headline[:97].rsplit(" ", 1)[0] + "…"

    return headline


_GENERIC_CWV_REC = "See Performance (Core Web Vitals) in this audit, or re-run Lighthouse from Run audit."


def _normalize_recommendation(rec: Optional[str]) -> Optional[str]:
    if not rec:
        return None
    if rec.strip() == _GENERIC_CWV_REC:
        return "Review Lighthouse audit details for this page."
    return rec.strip()


def collapse_duplicate_issues(issues: list[PdfIssue]) -> list[PdfIssue]:
    """Merge rows that share the same headline + recommendation into one card with URL list."""
    buckets: dict[tuple[str, str], list[PdfIssue]] = {}
    order: list[tuple[str, str]] = []
    for iss in issues:
        key = (iss.headline, iss.recommendation or "")
        if key not in buckets:
            order.append(key)
            buckets[key] = []
        buckets[key].append(iss)

    collapsed: list[PdfIssue] = []
    for key in order:
        group = buckets[key]
        first = group[0]
        urls: list[str] = []
        for item in group:
            if item.url and item.url not in urls:
                urls.append(item.url)
        if len(urls) <= 1:
            collapsed.append(first)
            continue
        headline = first.headline
        if len(urls) > 1 and not headline.endswith(")"):
            headline = f"{headline} ({len(urls)} URLs)"
        collapsed.append(PdfIssue(
            id=first.id,
            priority=first.priority,
            category=first.category,
            headline=headline,
            url=None,
            path=first.path,
            detail=first.detail,
            recommendation=first.recommendation,
            metrics=first.metrics,
            tags=first.tags,
            related_urls=urls,
        ))
    return collapsed


def normalize_issue_for_pdf(
    row: dict[str, Any],
    include_recommendation: bool = True,
) -> PdfIssue:
    """Convert a raw issues_row dict → PdfIssue for print layout."""
    priority = str(row.get("priority") or "").lower()
    category = str(row.get("category") or "")
    raw_message = str(row.get("message") or "").strip()
    url = str(row.get("url") or "").strip()
    recommendation = _normalize_recommendation(
        str(row.get("recommendation") or "").strip() if include_recommendation else None
    )

    # Detect Lighthouse rows (audit-id only, no human label). Pass the row's own
    # tags so tag-based detection actually works (was hardcoded to [], making the
    # `"lighthouse" in tags` branch dead).
    is_lh, audit_id = _is_lighthouse_row(
        raw_message, [str(t).lower() for t in (row.get("tags") or [])]
    )
    if is_lh and audit_id:
        headline = _lh_label(audit_id)
    else:
        headline = _strip_url_from_headline(raw_message, url)

    headline = _shorten_headline(headline, raw_message, url)

    tags: list[str] = []
    lower_msg = raw_message.lower()
    if "sitemap" in lower_msg:
        tags.append("sitemap")
    if is_lh or "lighthouse" in lower_msg:
        tags.append("lighthouse")
    if "axe" in lower_msg or "wcag" in lower_msg or "contrast" in lower_msg:
        tags.append("axe")
    if "redirect" in lower_msg:
        tags.append("redirect")
    if "canonical" in lower_msg:
        tags.append("canonical")
    if "security" in category.lower():
        tags.append("security")

    # Metrics from issue dict (ReportIssue fields)
    gsc_clicks = row.get("gsc_clicks")
    gsc_imp = row.get("gsc_impressions")
    impact = row.get("impact_score")
    lh_id = audit_id if is_lh else row.get("lh_audit_id")
    metrics = None
    if any(v is not None for v in (gsc_clicks, gsc_imp, impact, lh_id)):
        metrics = PdfIssueMetrics(
            gsc_clicks=int(gsc_clicks) if gsc_clicks is not None else None,
            gsc_impressions=int(gsc_imp) if gsc_imp is not None else None,
            impact_score=float(impact) if impact is not None else None,
            lh_audit_id=str(lh_id) if lh_id else None,
        )

    return PdfIssue(
        id=_issue_id(row),
        priority=priority,
        category=category,
        headline=headline,
        url=url or None,
        path=_extract_path(url),
        detail=None,
        recommendation=recommendation or None,
        metrics=metrics,
        tags=tags,
    )


# ---------------------------------------------------------------------------
# Grouping
# ---------------------------------------------------------------------------

_PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
_PRIORITY_LABELS = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
}

# Above this count per priority, sub-group by category
_SUBGROUP_THRESHOLD = 8

# Always use stacked list layout — tables only for cover top-issues / URL inventory
_COMPACT_TABLE_THRESHOLD = 999


def group_issues_for_pdf(
    issues: list[PdfIssue],
    issues_per_group: int = 25,
    issues_total: int = 120,
) -> list[IssueGroupBlock]:
    """Group PdfIssue list by priority → category, returning IssueGroupBlock list."""
    # Sort and cap total
    sorted_issues = sorted(issues, key=lambda i: (_PRIORITY_ORDER.get(i.priority, 9), i.category))
    if len(sorted_issues) > issues_total:
        sorted_issues = sorted_issues[:issues_total]

    # Bucket by priority
    by_priority: dict[str, list[PdfIssue]] = {}
    for iss in sorted_issues:
        by_priority.setdefault(iss.priority, []).append(iss)

    groups: list[IssueGroupBlock] = []

    for pri in ("critical", "high", "medium", "low"):
        pri_issues = by_priority.get(pri, [])
        if not pri_issues:
            continue

        pri_label = _PRIORITY_LABELS.get(pri, pri.title())
        total_in_pri = len(pri_issues)

        if total_in_pri <= _SUBGROUP_THRESHOLD:
            # Single group for this priority
            shown = collapse_duplicate_issues(pri_issues[:issues_per_group])
            trunc = (
                PdfTruncation(shown=len(shown), total=total_in_pri)
                if total_in_pri > len(shown)
                else None
            )
            render_as = "compact_table" if len(shown) >= _COMPACT_TABLE_THRESHOLD else "list"
            groups.append(IssueGroupBlock(
                id=f"findings.{pri}",
                title=f"{pri_label} findings",
                group_label=f"{pri_label} — {total_in_pri} issue{'s' if total_in_pri != 1 else ''}",
                issues=shown,
                render_as=render_as,
                truncation=trunc,
            ))
        else:
            # Sub-group by category
            by_cat: dict[str, list[PdfIssue]] = {}
            for iss in pri_issues:
                by_cat.setdefault(iss.category, []).append(iss)

            for cat, cat_issues in sorted(by_cat.items()):
                cat_total = len(cat_issues)
                shown = collapse_duplicate_issues(cat_issues[:issues_per_group])
                trunc = (
                    PdfTruncation(shown=len(shown), total=cat_total)
                    if cat_total > len(shown)
                    else None
                )
                render_as = "compact_table" if len(shown) >= _COMPACT_TABLE_THRESHOLD else "list"
                cat_id = cat.lower().replace(" ", "_").replace("&", "and")
                groups.append(IssueGroupBlock(
                    id=f"findings.{pri}.{cat_id}",
                    title=f"{pri_label} — {cat}",
                    group_label=f"{pri_label} — {cat}: {cat_total} issue{'s' if cat_total != 1 else ''}",
                    issues=shown,
                    render_as=render_as,
                    truncation=trunc,
                ))

    return groups
