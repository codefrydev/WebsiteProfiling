"""Bing Webmaster Tools integration (GetLinkCounts for inbound link pages)."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def _bing_json_get(method: str, api_key: str, **params: str | int) -> dict[str, Any]:
    query = urllib.parse.urlencode({**params, "apikey": api_key})
    url = f"https://ssl.bing.com/webmaster/api.svc/json/{method}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(body)
            msg = err.get("Message") or err.get("message") or body
        except json.JSONDecodeError:
            msg = body or str(e)
        return {"error": msg, "http_status": e.code}
    except Exception as e:
        return {"error": str(e)}


def fetch_bing_backlinks_summary(api_key: str, site_url: str) -> dict[str, Any]:
    """
    Fetch pages with inbound links via Bing Webmaster GetLinkCounts.
    Requires a verified site and API key from Bing Webmaster Tools.
    """
    key = (api_key or "").strip()
    site = (site_url or "").strip()
    if not key or not site:
        return {"ok": False, "error": "Bing API key and site URL required", "source": "bing_webmaster"}

    raw = _bing_json_get("GetLinkCounts", key, siteUrl=site, page=0)
    if raw.get("error"):
        return {
            "ok": False,
            "error": str(raw.get("error")),
            "source": "bing_webmaster",
            "site_url": site,
        }

    payload = raw.get("d") if isinstance(raw.get("d"), dict) else raw
    links = payload.get("Links") if isinstance(payload, dict) else []
    pages: list[dict[str, Any]] = []
    for row in links or []:
        if not isinstance(row, dict):
            continue
        pages.append({
            "url": row.get("Url"),
            "inbound_links": int(row.get("Count") or 0),
        })

    total_inbound = sum(int(p.get("inbound_links") or 0) for p in pages)
    return {
        "ok": True,
        "source": "bing_webmaster",
        "site_url": site,
        "linked_pages": pages[:100],
        "linked_page_count": len(pages),
        "total_inbound_links": total_inbound,
        "total_pages": int(payload.get("TotalPages") or 1) if isinstance(payload, dict) else 1,
        "provenance": "Bing Webmaster",
    }
