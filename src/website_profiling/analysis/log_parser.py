"""Parse nginx/apache combined logs for crawl budget insights."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

# Common combined log: host ident user [time] "METHOD path PROTO" status size "referer" "ua"
_COMBINED_RE = re.compile(
    r'^\S+\s+\S+\s+\S+\s+\[[^\]]+\]\s+"[A-Z]+\s+(\S+)\s+[^"]*"\s+(\d{3})\s+\S+\s+"[^"]*"\s+"([^"]*)"',
)


def parse_access_log_lines(lines: list[str]) -> dict[str, Any]:
    """Return hit counts and URL sets from access log lines."""
    url_hits: Counter[str] = Counter()
    status_hits: Counter[str] = Counter()
    googlebot_hits = 0
    parsed_lines = 0

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _COMBINED_RE.match(line)
        if not m:
            continue
        parsed_lines += 1
        path, status, ua = m.group(1), m.group(2), m.group(3).lower()
        url_hits[path] += 1
        status_hits[status] += 1
        if "googlebot" in ua:
            googlebot_hits += 1

    top_urls = [{"path": p, "hits": c} for p, c in url_hits.most_common(100)]
    return {
        "parsed_lines": parsed_lines,
        "unique_paths": len(url_hits),
        "googlebot_hits": googlebot_hits,
        "status_counts": dict(status_hits),
        "top_paths": top_urls,
    }


def compare_log_to_crawl(
    log_analysis: dict[str, Any],
    crawl_urls: list[str],
    start_url: str,
) -> dict[str, Any]:
    """Paths in logs but not crawled, and crawled but not in logs."""
    from urllib.parse import urlparse

    log_paths = {row["path"] for row in log_analysis.get("top_paths") or []}
    crawl_paths: set[str] = set()
    for u in crawl_urls:
        try:
            crawl_paths.add(urlparse(u).path or "/")
        except Exception:
            continue

    log_only = sorted(log_paths - crawl_paths)[:200]
    crawl_only = sorted(crawl_paths - log_paths)[:200]
    return {
        "log_only_paths": log_only,
        "crawl_only_paths": crawl_only,
        "log_only_count": len(log_paths - crawl_paths),
        "crawl_only_count": len(crawl_paths - log_paths),
        "origin": start_url,
    }
