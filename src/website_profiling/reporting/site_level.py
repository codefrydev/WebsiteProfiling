"""Site-level file checks (robots, sitemap, ads.txt)."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import requests

def _fetch_site_level(start_url: str, timeout: int = 8) -> dict:
    """Fetch robots.txt, sitemap.xml, ads.txt, and security.txt from start_url origin."""
    from .site_files import fetch_ads_txt, fetch_security_txt, merge_site_file_fields

    parsed = urlparse(start_url)
    if not parsed.scheme or not parsed.netloc:
        return {
            "robots_present": False,
            "sitemap_present": False,
            "sitemap_valid": False,
            "ads_txt_present": False,
            "security_txt_present": False,
        }
    base = f"{parsed.scheme}://{parsed.netloc}"
    session = requests.Session()
    session.headers.update({"User-Agent": "WebsiteProfiling/1.0"})
    out: dict[str, Any] = {
        "robots_present": False,
        "sitemap_present": False,
        "sitemap_valid": False,
    }
    try:
        r = session.get(f"{base}/robots.txt", timeout=timeout)
        if r.status_code == 200 and r.text:
            out["robots_present"] = True
            for line in r.text.splitlines():
                line = line.strip()
                if line.lower().startswith("sitemap:"):
                    break
    except Exception:
        pass
    try:
        r = session.get(f"{base}/sitemap.xml", timeout=timeout)
        if r.status_code == 200 and r.text:
            out["sitemap_present"] = True
            out["sitemap_valid"] = "<" in r.text and ">" in r.text and ("urlset" in r.text or "sitemapindex" in r.text)
    except Exception:
        pass
    merge_site_file_fields(out, fetch_ads_txt(session, base, timeout=timeout))
    merge_site_file_fields(out, fetch_security_txt(session, base, timeout=timeout))
    return out
