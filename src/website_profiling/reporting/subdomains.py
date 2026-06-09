"""Passive subdomain inventory from crawl, GSC, and certificate transparency."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import requests

from ..config import get_bool


def _strip_www(host: str) -> str:
    h = (host or "").strip().lower()
    return h[4:] if h.startswith("www.") else h


def _apex_from_start_url(start_url: str) -> str:
    parsed = urlparse((start_url or "").strip())
    return _strip_www(parsed.netloc or "")


def _host_in_scope(host: str, apex: str) -> bool:
    h = _strip_www(host)
    if not h or not apex:
        return False
    return h == apex or h.endswith(f".{apex}")


def _crawl_hosts(df: pd.DataFrame) -> dict[str, int]:
    if df is None or df.empty or "url" not in df.columns:
        return {}
    ok = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    counts: dict[str, int] = {}
    for url in ok["url"].dropna().astype(str):
        host = (urlparse(url.strip()).netloc or "").lower()
        if host:
            counts[host] = counts.get(host, 0) + 1
    return counts


def _gsc_hosts(indexation_cov: dict[str, Any] | None) -> tuple[dict[str, int], list[str]]:
    """Return host URL counts from GSC pages and gsc_not_crawled list."""
    counts: dict[str, int] = {}
    not_crawled_hosts: set[str] = set()
    if not indexation_cov:
        return counts, []
    lists = indexation_cov.get("lists") if isinstance(indexation_cov.get("lists"), dict) else {}
    for url in lists.get("gsc_not_crawled") or []:
        host = (urlparse(str(url).strip()).netloc or "").lower()
        if host:
            not_crawled_hosts.add(host)
            counts[host] = counts.get(host, 0) + 1
    url_join = indexation_cov.get("url_join")
    if isinstance(url_join, dict):
        for cat in ("gsc_only",):
            rows = url_join.get(cat)
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict):
                        u = str(row.get("url") or row.get("page") or "").strip()
                    else:
                        u = str(row).strip()
                    if not u:
                        continue
                    host = (urlparse(u).netloc or "").lower()
                    if host:
                        counts[host] = counts.get(host, 0) + 1
    return counts, sorted(not_crawled_hosts)


def _fetch_crtsh_hosts(apex: str, timeout: float = 8.0) -> tuple[set[str], str | None]:
    """Query crt.sh for subdomains. Returns hosts and optional error message."""
    if not apex:
        return set(), None
    try:
        r = requests.get(
            "https://crt.sh/",
            params={"q": f"%.{apex}", "output": "json"},
            timeout=timeout,
            headers={"User-Agent": "WebsiteProfiling/1.0"},
        )
        if r.status_code != 200:
            return set(), f"crtsh: HTTP {r.status_code}"
        data = r.json()
        if not isinstance(data, list):
            return set(), "crtsh: unexpected response"
        hosts: set[str] = set()
        for row in data:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name_value") or "").strip().lower()
            for part in name.split("\n"):
                part = part.strip().lstrip("*.")
                if part and "." in part:
                    hosts.add(part)
        return hosts, None
    except Exception as e:
        return set(), f"crtsh: {e}"


def build_subdomain_inventory(
    df: pd.DataFrame,
    indexation_cov: dict[str, Any] | None,
    start_url: str,
    config: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build passive subdomain inventory tied to crawl and GSC coverage."""
    if not get_bool(config or {}, "enable_subdomain_discovery", True):
        return {"disabled": True, "apex": _apex_from_start_url(start_url), "hosts": []}

    apex = _apex_from_start_url(start_url)
    crawl_counts = _crawl_hosts(df)
    gsc_counts, gsc_not_crawled_from_lists = _gsc_hosts(indexation_cov)

    host_meta: dict[str, dict[str, Any]] = {}

    def _ensure(host: str) -> dict[str, Any]:
        h = host.lower()
        if h not in host_meta:
            host_meta[h] = {
                "host": h,
                "sources": [],
                "in_crawl": False,
                "in_gsc": False,
                "url_count_crawl": 0,
                "url_count_gsc": 0,
                "in_scope": _host_in_scope(h, apex),
            }
        return host_meta[h]

    for host, count in crawl_counts.items():
        meta = _ensure(host)
        if "crawl" not in meta["sources"]:
            meta["sources"].append("crawl")
        meta["in_crawl"] = True
        meta["url_count_crawl"] = count

    for host, count in gsc_counts.items():
        meta = _ensure(host)
        if "gsc" not in meta["sources"]:
            meta["sources"].append("gsc")
        meta["in_gsc"] = True
        meta["url_count_gsc"] = max(meta["url_count_gsc"], count)

    crtsh_error: str | None = None
    if get_bool(config or {}, "subdomain_ct_lookup", True) and apex:
        ct_hosts, crtsh_error = _fetch_crtsh_hosts(apex)
        for host in ct_hosts:
            meta = _ensure(host)
            if "crtsh" not in meta["sources"]:
                meta["sources"].append("crtsh")

    gsc_hosts_not_crawled: list[str] = []
    for host, meta in host_meta.items():
        if meta["in_gsc"] and not meta["in_crawl"] and meta["in_scope"]:
            gsc_hosts_not_crawled.append(host)
    gsc_hosts_not_crawled = sorted(set(gsc_hosts_not_crawled) | set(gsc_not_crawled_from_lists))

    out_of_scope: list[str] = sorted(h for h, m in host_meta.items() if not m["in_scope"])

    hosts = sorted(host_meta.values(), key=lambda x: x["host"])
    result: dict[str, Any] = {
        "apex": apex,
        "hosts": hosts,
        "gsc_hosts_not_crawled": gsc_hosts_not_crawled,
        "out_of_scope_discovered": out_of_scope,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    if crtsh_error:
        result["crtsh_error"] = crtsh_error
    return result
