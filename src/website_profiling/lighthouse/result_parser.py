"""Parse Lighthouse JSON output into summary metrics."""
from __future__ import annotations

from typing import Any

import statistics

def _evidence_from_audit(audit: dict[str, Any]) -> list[str]:
    """Extract resource URLs or selectors from audit details."""
    evidence: list[str] = []
    details = audit.get("details")
    if not details or not isinstance(details, dict):
        return evidence
    items = details.get("items") or details.get("nodes") or []
    if not isinstance(items, list):
        return evidence
    for item in items[:5]:
        if isinstance(item, dict):
            url = item.get("url")
            if url and isinstance(url, str) and not str(url).startswith("data:"):
                evidence.append(str(url)[:500])
            node = item.get("node")
            if isinstance(node, dict) and node.get("selector"):
                evidence.append(str(node["selector"])[:200])
            if item.get("selector"):
                evidence.append(str(item["selector"])[:200])
    return evidence[:15]


def extract_from_lighthouse_json(data: dict) -> dict[str, Any]:
    """Extract LCP, CLS, TBT, FCP, Speed Index, category scores (all 5), and top 10 failing audits with impact and evidence."""
    out: dict[str, Any] = {
        "lcp_ms": None,
        "cls": None,
        "tbt_ms": None,
        "fcp_ms": None,
        "speed_index_ms": None,
        "performance_score": None,
        "accessibility_score": None,
        "seo_score": None,
        "best_practices_score": None,
        "pwa_score": None,
        "category_scores": {},
        "top_failures": [],
    }
    lr = data.get("lighthouseResult") or data
    audits = lr.get("audits") or {}
    cats = lr.get("categories") or {}

    for audit_id, key in [
        ("largest-contentful-paint", "lcp_ms"),
        ("cumulative-layout-shift", "cls"),
        ("total-blocking-time", "tbt_ms"),
        ("first-contentful-paint", "fcp_ms"),
        ("speed-index", "speed_index_ms"),
    ]:
        a = audits.get(audit_id)
        if a is not None and "numericValue" in a:
            out[key] = a["numericValue"]

    for cat_id, key in [
        ("performance", "performance_score"),
        ("accessibility", "accessibility_score"),
        ("seo", "seo_score"),
        ("best-practices", "best_practices_score"),
        ("pwa", "pwa_score"),
    ]:
        c = cats.get(cat_id)
        if c is not None and "score" in c:
            s = c["score"]
            out[key] = s
            out["category_scores"][cat_id] = round((s * 100)) if s is not None else None

    # Resolve impact from warning_mapper for each failure
    from ..tools.warnings import resolve_impact
    failures = []
    for aid, a in audits.items():
        if a is None:
            continue
        score = a.get("score")
        if score is None:
            continue
        if score < 1:
            title = a.get("title") or aid
            help_text = a.get("helpText") or ""
            impact = resolve_impact(aid, title, help_text)
            evidence = _evidence_from_audit(a)
            failures.append({
                "id": aid,
                "score": score,
                "helpText": help_text,
                "impact": impact,
                "evidence": evidence,
            })
    failures.sort(key=lambda x: (x["score"] or 0))
    out["top_failures"] = failures[:10]

    return out


def median_or_none(values: list[float]) -> float | None:
    """Return median of list; None if empty or all None."""
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return statistics.median(clean)

