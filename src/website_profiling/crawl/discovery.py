"""Crawl discovery mode helpers (spider, list, sitemap, hybrid)."""
from __future__ import annotations

from ..common import normalize_link

DISCOVERY_MODES = frozenset({"spider", "list", "sitemap", "hybrid"})


def normalize_discovery_mode(mode: str | None) -> str:
    m = (mode or "spider").strip().lower()
    return m if m in DISCOVERY_MODES else "spider"


def parse_crawl_url_list(raw: str | None, *, start_url: str = "") -> list[str]:
    """Parse newline- or comma-separated URL list; dedupe preserving order."""
    if not raw or not str(raw).strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for line in str(raw).replace("\r", "").split("\n"):
        for part in line.split(","):
            u = part.strip().rstrip("/")
            if not u:
                continue
            if start_url and not u.startswith(("http://", "https://")):
                normalized = normalize_link(start_url, u)
                if normalized:
                    u = normalized.rstrip("/")
            if u and u not in seen:
                seen.add(u)
                out.append(u)
    return out


def follow_links_for_mode(mode: str) -> bool:
    return normalize_discovery_mode(mode) in ("spider", "hybrid")


def seed_sitemap_for_mode(mode: str) -> bool:
    return normalize_discovery_mode(mode) in ("spider", "sitemap", "hybrid")
