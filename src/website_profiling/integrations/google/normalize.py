"""
URL normalization for joining crawl URLs with GSC pages and GA4 paths.
"""
from __future__ import annotations

from urllib.parse import urlparse

from ...common import strip_www_prefix


def normalize_url(url: str) -> str:
    """Strip scheme, www., lowercase -- for join key."""
    url = url.strip()
    parsed = urlparse(url)
    host = strip_www_prefix(parsed.netloc.lower())
    path = parsed.path or "/"
    return f"{host}{path}"


def url_to_path(url: str) -> str:
    """Extract just the path component from a URL."""
    try:
        return urlparse(url).path or "/"
    except Exception:
        return url


def path_to_url(path: str, start_url: str) -> str:
    """Convert a GA4 path (/blog/post) to a full URL using start_url's origin."""
    try:
        parsed = urlparse(start_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        return origin + (path if path.startswith("/") else "/" + path)
    except Exception:
        return path


def build_crawl_norm_map(links: list[dict]) -> dict[str, str]:
    """
    Build {normalized_key: original_url} from a list of crawl link records.
    Used to match GSC pages and GA4 paths back to crawled URLs.
    """
    result: dict[str, str] = {}
    for rec in links:
        u = str(rec.get("url") or "").strip()
        if not u:
            continue
        result[normalize_url(u)] = u
    return result


def compute_url_join(
    crawl_urls: list[str],
    gsc_pages: list[str],
    ga4_paths: list[str],
    start_url: str,
    *,
    gsc_by_page: dict | None = None,
    ga4_by_path: dict | None = None,
    list_limit: int = 200,
) -> dict:
    """
    Compute join statistics between crawl, GSC, and GA4 URL sets.
    Also builds capped, metrics-sorted URL gap lists (up to list_limit per category).
    """
    # crawl: norm -> original_url
    crawl_norm: dict[str, str] = {}
    for u in crawl_urls:
        if u:
            crawl_norm[normalize_url(u)] = u

    # GSC: norm -> (original_url, metrics_dict)
    gsc_norm: dict[str, tuple[str, dict]] = {}
    for url in (gsc_pages or []):
        if not url:
            continue
        m = (gsc_by_page or {}).get(url) or {}
        gsc_norm[normalize_url(url)] = (url, m)

    # GA4: norm -> (full_url, metrics_dict)
    ga4_norm: dict[str, tuple[str, dict]] = {}
    for path in (ga4_paths or []):
        if not path:
            continue
        full = path_to_url(path, start_url)
        m = (ga4_by_path or {}).get(path) or {}
        ga4_norm[normalize_url(full)] = (full, m)

    crawl_keys = set(crawl_norm)
    gsc_keys = set(gsc_norm)
    ga4_keys = set(ga4_norm)

    matched = len(crawl_keys & (gsc_keys | ga4_keys))
    crawl_only_keys = crawl_keys - gsc_keys - ga4_keys
    gsc_only_keys = gsc_keys - crawl_keys
    ga4_only_keys = ga4_keys - crawl_keys

    def _cap(lst: list, limit: int) -> tuple[list, int]:
        return lst[:limit], len(lst)

    crawl_only_list, crawl_only_total = _cap(
        [{"url": crawl_norm[k]} for k in crawl_only_keys],
        list_limit,
    )

    gsc_only_sorted = sorted(
        [
            {
                "url": gsc_norm[k][0],
                "clicks": int((gsc_norm[k][1].get("clicks") or 0)),
                "impressions": int((gsc_norm[k][1].get("impressions") or 0)),
            }
            for k in gsc_only_keys
        ],
        key=lambda r: r["impressions"],
        reverse=True,
    )
    gsc_only_list, gsc_only_total = _cap(gsc_only_sorted, list_limit)

    ga4_only_sorted = sorted(
        [
            {
                "url": ga4_norm[k][0],
                "sessions": int((ga4_norm[k][1].get("sessions") or 0)),
            }
            for k in ga4_only_keys
        ],
        key=lambda r: r["sessions"],
        reverse=True,
    )
    ga4_only_list, ga4_only_total = _cap(ga4_only_sorted, list_limit)

    return {
        "matched": matched,
        "crawl_only": len(crawl_only_keys),
        "gsc_only": len(gsc_only_keys),
        "ga4_only": len(ga4_only_keys),
        "lists": {
            "crawl_only": crawl_only_list,
            "gsc_only": gsc_only_list,
            "ga4_only": ga4_only_list,
        },
        "lists_total": {
            "crawl_only": crawl_only_total,
            "gsc_only": gsc_only_total,
            "ga4_only": ga4_only_total,
        },
        "list_limit": list_limit,
    }
