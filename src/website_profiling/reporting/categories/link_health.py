"""Report category: link_health."""
from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from ._helpers import (
    PRIORITY_ORDER,
    REDIRECT_CHAIN_LONG,
    _broken_link_sources,
    _issue,
    _orphan_hub_suggestions,
    _score_deductions,
    _sort_issues,
)
from ..terminology import (
    CATEGORY_LINKS,
)

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
    broken_url_set = {str(b.get("url") or "").strip() for b in issues_broken if b.get("url")}
    issues.extend(_broken_link_sources(edges, broken_url_set))
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
                recommendation="Add internal links to important pages to improve crawlability and internal link equity.",
            ))
            deductions.append((5, True))
        issues.extend(_orphan_hub_suggestions(edges, orphans[:15]))

    score = _score_deductions(100, deductions)
    return {
        "id": "link_health",
        "name": CATEGORY_LINKS,
        "score": score,
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }

