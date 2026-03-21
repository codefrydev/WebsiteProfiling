"""
Site Explorer: domain backlink analysis, competitor research, content gap analysis.

Usage:
    python -m src site-explorer overview   --domain example.com
    python -m src site-explorer backlinks  --domain example.com
    python -m src site-explorer compare    --domains "a.com,b.com,c.com"
    python -m src site-explorer gap        --domain1 a.com --domain2 b.com

Uses DataForSEO if DATAFORSEO_LOGIN/PASSWORD set, otherwise uses open data sources.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Any, Optional
from urllib.parse import urlparse

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import (
    get_connection,
    init_extended_schema,
    read_backlinks,
    read_domain_profile,
    read_organic_keywords,
    write_backlinks,
    write_domain_profile,
    write_organic_keywords,
)

_DFS_LOGIN = os.getenv("DATAFORSEO_LOGIN", "")
_DFS_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "")


class SiteExplorer:
    """Domain/competitor analysis using DataForSEO or free data sources."""

    def __init__(self, timeout: int = 20, delay: float = 1.0) -> None:
        self.timeout = timeout
        self.delay = delay
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; SiteExplorer/1.0)"
        })

    def _dfs_post(self, endpoint: str, payload: list) -> dict:
        """POST to DataForSEO endpoint and return parsed JSON."""
        r = self._session.post(
            f"https://api.dataforseo.com/v3/{endpoint}",
            auth=(_DFS_LOGIN, _DFS_PASSWORD),
            json=payload,
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    def get_domain_overview(self, domain: str) -> dict:
        """Get domain overview metrics. Uses DataForSEO or estimation from public data."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "dataforseo_labs/google/domain_rank_overview/live",
                    [{"target": domain, "location_code": 2840, "language_code": "en"}],
                )
                result = (data.get("tasks", [{}])[0].get("result") or [{}])[0]
                metrics = result.get("metrics", {}).get("organic", {})
                return {
                    "domain": domain,
                    "domain_rating": result.get("domain_rank", 0),
                    "organic_traffic_est": metrics.get("etv", 0),
                    "organic_keywords_count": metrics.get("count", 0),
                    "referring_domains_count": 0,
                    "backlinks_count": 0,
                    "traffic_value_est": metrics.get("estimated_paid_traffic_cost", 0),
                    "data": result,
                }
            except Exception as exc:
                print(f"DataForSEO error: {exc}")
        return self._estimate_domain_overview(domain)

    def _estimate_domain_overview(self, domain: str) -> dict:
        """Estimate domain overview using free public APIs."""
        overview: dict[str, Any] = {
            "domain": domain,
            "domain_rating": self.estimate_domain_rating(domain),
            "organic_traffic_est": 0,
            "organic_keywords_count": 0,
            "referring_domains_count": 0,
            "backlinks_count": 0,
            "traffic_value_est": 0,
            "data": {"note": "estimated - no API key configured"},
        }
        try:
            # Use CommonCrawl index to count URLs
            r = self._session.get(
                f"https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=*.{domain}/*&output=json&limit=1",
                timeout=10,
            )
            if r.status_code == 200:
                lines = [l for l in r.text.strip().splitlines() if l]
                overview["organic_keywords_count"] = len(lines) * 5
        except Exception:
            pass
        return overview

    def get_backlinks(self, domain: str, limit: int = 100) -> list[dict]:
        """Get backlinks for a domain."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "backlinks/backlinks/live",
                    [{"target": domain, "limit": limit, "mode": "as_is", "filters": ["dofollow", "=", True]}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {
                        "source_url": i.get("url_from", ""),
                        "target_url": i.get("url_to", ""),
                        "anchor_text": i.get("anchor", ""),
                        "is_dofollow": int(i.get("dofollow", True)),
                        "domain_rating": i.get("domain_from_rank", 0),
                        "link_type": i.get("type", "text"),
                        "first_seen": i.get("first_seen"),
                        "last_seen": i.get("last_seen"),
                    }
                    for i in items
                ]
            except Exception as exc:
                print(f"DataForSEO backlinks error: {exc}")
        return self._get_free_backlinks(domain, limit)

    def _get_free_backlinks(self, domain: str, limit: int) -> list[dict]:
        """Attempt backlink data from open sources (limited)."""
        backlinks = []
        try:
            # Try Open PageRank API (free tier)
            r = self._session.get(
                f"https://openpagerank.com/api/v1.0/getPageRank?domains[]={domain}",
                headers={"API-OPR": os.getenv("OPEN_PAGE_RANK_KEY", "")},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                rank = data.get("response", [{}])[0].get("page_rank_integer", 0)
                print(f"  OpenPageRank for {domain}: {rank}/10")
        except Exception:
            pass
        if not backlinks:
            print(f"  No API key configured for backlink data for {domain}.")
        return backlinks

    def get_referring_domains(self, domain: str) -> list[dict]:
        """Get referring domains for a target domain."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "backlinks/referring_domains/live",
                    [{"target": domain, "limit": 100}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {
                        "domain": i.get("domain", ""),
                        "backlinks_count": i.get("backlinks", 0),
                        "domain_rating": i.get("domain_from_rank", 0),
                        "first_seen": i.get("first_seen"),
                        "last_seen": i.get("last_seen"),
                    }
                    for i in items
                ]
            except Exception as exc:
                print(f"DataForSEO referring domains error: {exc}")
        return []

    def get_organic_keywords(self, domain: str, limit: int = 100) -> list[dict]:
        """Get organic keywords a domain ranks for."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "dataforseo_labs/google/ranked_keywords/live",
                    [{"target": domain, "location_code": 2840, "language_code": "en", "limit": limit}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {
                        "keyword": i.get("keyword_data", {}).get("keyword", ""),
                        "position": i.get("ranked_serp_element", {}).get("serp_item", {}).get("rank_absolute", 0),
                        "volume": i.get("keyword_data", {}).get("keyword_info", {}).get("search_volume", 0),
                        "traffic_est": i.get("ranked_serp_element", {}).get("serp_item", {}).get("etv", 0),
                        "url": i.get("ranked_serp_element", {}).get("serp_item", {}).get("url", ""),
                    }
                    for i in items
                ]
            except Exception as exc:
                print(f"DataForSEO organic keywords error: {exc}")
        return []

    def get_paid_keywords(self, domain: str) -> list[dict]:
        """Get paid (PPC) keywords a domain is bidding on."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "dataforseo_labs/google/ad_keywords_by_domain/live",
                    [{"target": domain, "location_code": 2840, "language_code": "en", "limit": 50}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {
                        "keyword": i.get("keyword", ""),
                        "position": i.get("ad_position", 0),
                        "cpc": i.get("cpc", 0),
                        "ad_copy": str(i.get("ad_data", {}).get("description", "")),
                        "landing_page": i.get("ad_data", {}).get("target_url", ""),
                    }
                    for i in items
                ]
            except Exception as exc:
                print(f"DataForSEO paid keywords error: {exc}")
        return []

    def get_broken_backlinks(self, domain: str) -> list[dict]:
        """Get backlinks pointing to broken (404) pages."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "backlinks/backlinks/live",
                    [{"target": domain, "limit": 50, "filters": ["broken_link", "=", True]}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {"source_url": i.get("url_from", ""), "target_url": i.get("url_to", ""), "is_broken": 1}
                    for i in items
                ]
            except Exception:
                pass
        return []

    def get_outgoing_links(self, domain: str) -> list[dict]:
        """Get outgoing external links from a domain."""
        domain = _clean_domain(domain)
        if _DFS_LOGIN and _DFS_PASSWORD:
            try:
                data = self._dfs_post(
                    "backlinks/outgoing_links/live",
                    [{"target": domain, "limit": 50}],
                )
                items = (data.get("tasks", [{}])[0].get("result") or [{}])[0].get("items", [])
                return [
                    {"target_url": i.get("url_to", ""), "anchor": i.get("anchor", ""), "type": i.get("type", "")}
                    for i in items
                ]
            except Exception:
                pass
        return []

    def find_content_gap(self, domain1: str, domain2: str) -> list[dict]:
        """Find keywords domain2 ranks for that domain1 doesn't."""
        kws1 = {k["keyword"] for k in self.get_organic_keywords(domain1, 200)}
        kws2 = self.get_organic_keywords(domain2, 200)
        return [k for k in kws2 if k["keyword"] not in kws1]

    def find_link_intersect(self, domains: list[str], target: str) -> list[dict]:
        """Find domains linking to all given domains but not to target."""
        if len(domains) < 2:
            return []
        sets = [
            {b["source_url"] for b in self.get_backlinks(d, 200)}
            for d in domains
        ]
        target_sources = {b["source_url"] for b in self.get_backlinks(target, 200)}
        common = sets[0]
        for s in sets[1:]:
            common &= s
        missing = common - target_sources
        return [{"source_url": url} for url in list(missing)[:100]]

    def get_anchor_text_distribution(self, domain: str) -> list[dict]:
        """Return anchor text distribution for a domain's backlinks."""
        backlinks = self.get_backlinks(domain, 200)
        from collections import Counter
        counts = Counter(b.get("anchor_text", "") for b in backlinks)
        total = sum(counts.values()) or 1
        return [
            {"anchor": anchor, "count": count, "pct": round(count / total * 100, 2)}
            for anchor, count in counts.most_common(20)
        ]

    def estimate_domain_rating(self, domain: str) -> int:
        """Estimate domain authority/rating (0-100) using free signals."""
        domain = _clean_domain(domain)
        try:
            r = self._session.get(f"https://openpagerank.com/api/v1.0/getPageRank?domains[]={domain}",
                                  headers={"API-OPR": os.getenv("OPEN_PAGE_RANK_KEY", "")}, timeout=8)
            if r.status_code == 200:
                pr = r.json().get("response", [{}])[0].get("page_rank_integer", 0)
                return min(int(pr * 10), 100)
        except Exception:
            pass
        # Rough estimate based on TLD / known domain age heuristic
        tld = domain.split(".")[-1] if "." in domain else ""
        if tld in ("gov", "edu"):
            return 70
        return 30

    def compare_domains(self, domains: list[str]) -> dict:
        """Compare multiple domains side by side."""
        overviews = {}
        for domain in domains:
            print(f"  Fetching overview for {domain}...", flush=True)
            overviews[domain] = self.get_domain_overview(domain)
            time.sleep(self.delay)
        return overviews


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def _clean_domain(domain: str) -> str:
    """Normalize domain: strip scheme and trailing slashes."""
    if "://" in domain:
        domain = urlparse(domain).netloc or domain
    return domain.lstrip("www.").rstrip("/").lower()


def cmd_overview(db_path: str, domain: str) -> None:
    """Fetch and display domain overview, storing in DB."""
    explorer = SiteExplorer()
    print(f"Fetching overview for {domain}...", flush=True)
    overview = explorer.get_domain_overview(domain)
    write_domain_profile(get_connection(db_path), overview)

    print(f"\nDomain Overview: {domain}")
    print(f"  Domain Rating     : {overview.get('domain_rating', '?')}")
    print(f"  Organic Traffic   : {overview.get('organic_traffic_est', '?'):,}")
    print(f"  Organic Keywords  : {overview.get('organic_keywords_count', '?'):,}")
    print(f"  Referring Domains : {overview.get('referring_domains_count', '?'):,}")
    print(f"  Backlinks         : {overview.get('backlinks_count', '?'):,}")
    print(f"  Traffic Value     : ${overview.get('traffic_value_est', 0):,.2f}")


def cmd_backlinks(db_path: str, domain: str) -> None:
    """Fetch backlinks for a domain and store in DB."""
    explorer = SiteExplorer()
    print(f"Fetching backlinks for {domain}...", flush=True)
    backlinks = explorer.get_backlinks(domain)
    conn = get_connection(db_path)
    init_extended_schema(conn)
    write_backlinks(conn, _clean_domain(domain), backlinks)
    conn.close()
    print(f"Found {len(backlinks)} backlinks.")
    for bl in backlinks[:10]:
        print(f"  {bl.get('source_url', '')} -> {bl.get('target_url', '')}")


def cmd_compare(db_path: str, domains: list[str]) -> None:
    """Compare multiple domains side by side."""
    explorer = SiteExplorer()
    comparison = explorer.compare_domains(domains)
    conn = get_connection(db_path)
    init_extended_schema(conn)
    for domain, data in comparison.items():
        write_domain_profile(conn, data)
    conn.close()

    headers = ["Domain", "DR", "Traffic", "Keywords", "Ref Domains"]
    print(f"\n{'Domain':<30} {'DR':>4} {'Traffic':>10} {'Keywords':>10} {'Ref Domains':>12}")
    print("-" * 70)
    for domain, data in comparison.items():
        print(
            f"  {domain:<28} {data.get('domain_rating', 0):>4} "
            f"{data.get('organic_traffic_est', 0):>10,} "
            f"{data.get('organic_keywords_count', 0):>10,} "
            f"{data.get('referring_domains_count', 0):>12,}"
        )


def cmd_gap(db_path: str, domain1: str, domain2: str) -> None:
    """Find content gap (keywords domain2 has that domain1 lacks)."""
    explorer = SiteExplorer()
    print(f"Content gap: {domain1} vs {domain2}...", flush=True)
    gaps = explorer.find_content_gap(domain1, domain2)
    print(f"Found {len(gaps)} gap keywords:")
    for kw in gaps[:20]:
        print(f"  [{kw.get('position', '?'):>3}] {kw.get('keyword', '')}  vol={kw.get('volume', 0)}")


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for site-explorer command."""
    parser = argparse.ArgumentParser(description="Site Explorer")
    parser.add_argument("subcommand", choices=["overview", "backlinks", "compare", "gap"])
    parser.add_argument("--db", default="report.db")
    parser.add_argument("--domain", help="Target domain")
    parser.add_argument("--domains", help="Comma-separated list of domains for compare")
    parser.add_argument("--domain1", help="First domain for gap analysis")
    parser.add_argument("--domain2", help="Second domain for gap analysis")
    parsed = parser.parse_args(args)

    if parsed.subcommand == "overview":
        if not parsed.domain:
            print("Provide --domain")
            return 1
        cmd_overview(parsed.db, parsed.domain)
    elif parsed.subcommand == "backlinks":
        if not parsed.domain:
            print("Provide --domain")
            return 1
        cmd_backlinks(parsed.db, parsed.domain)
    elif parsed.subcommand == "compare":
        if not parsed.domains:
            print("Provide --domains")
            return 1
        cmd_compare(parsed.db, [d.strip() for d in parsed.domains.split(",")])
    elif parsed.subcommand == "gap":
        if not parsed.domain1 or not parsed.domain2:
            print("Provide --domain1 and --domain2")
            return 1
        cmd_gap(parsed.db, parsed.domain1, parsed.domain2)
    return 0
