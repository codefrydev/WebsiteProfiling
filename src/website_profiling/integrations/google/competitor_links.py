"""Competitor referring-domain gap from imported GSC Links data."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse


def _domain_from_site(site: str) -> str:
    s = (site or "").strip().lower()
    if not s:
        return ""
    if "://" in s:
        try:
            return (urlparse(s).hostname or "").lower()
        except Exception:
            return s
    return s.lstrip(".")


def build_competitor_link_gap(
    gsc_links: dict[str, Any] | None,
    competitor_domains: list[str],
) -> dict[str, Any] | None:
    """
    Compare top linking domains from GSC Links import against user-defined competitors.
    Returns domains that link to competitors but not to the property (Estimated).
    """
    if not gsc_links or not competitor_domains:
        return None
    our_domains = {
        _domain_from_site(row.get("site") or "")
        for row in (gsc_links.get("top_linking_sites") or [])
        if isinstance(row, dict)
    }
    our_domains.discard("")
    competitors = [_domain_from_site(d) for d in competitor_domains]
    competitors = [d for d in competitors if d]
    if not competitors:
        return None
    gaps = []
    for comp in competitors:
        if comp not in our_domains:
            gaps.append({
                "competitor": comp,
                "links_to_us": False,
                "note": "No referring domain match in imported GSC Links sample.",
            })
        else:
            gaps.append({"competitor": comp, "links_to_us": True})
    return {
        "source": "gsc_links_import",
        "provenance": "Search Console",
        "competitors": gaps,
        "our_referring_domain_count": len(our_domains),
    }


def parse_referring_domains_from_csv(csv_text: str) -> list[str]:
    """Extract referring domain names from a GSC Links-style CSV export."""
    import csv
    import io

    domains: list[str] = []
    if not (csv_text or "").strip():
        return domains
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return domains
    fields = {f.lower().strip(): f for f in reader.fieldnames if f}
    site_col = fields.get("site") or fields.get("domain") or fields.get("linking site")
    for row in reader:
        raw = (row.get(site_col) if site_col else None) or ""
        dom = _domain_from_site(str(raw))
        if dom and dom not in domains:
            domains.append(dom)
    return domains


def build_competitor_domain_gap(
    our_domains: set[str],
    competitor_domain: str,
    competitor_referring_domains: list[str],
) -> dict[str, Any]:
    """Domains in competitor sample that are not in our GSC Links sample (Estimated)."""
    comp = _domain_from_site(competitor_domain)
    comp_refs = {_domain_from_site(d) for d in competitor_referring_domains if d}
    comp_refs.discard("")
    missing = sorted(comp_refs - our_domains)
    return {
        "competitor": comp,
        "competitor_referring_count": len(comp_refs),
        "gap_domains": missing[:100],
        "gap_count": len(missing),
        "provenance": "Estimated",
    }
