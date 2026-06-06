"""Chrome UX Report (CrUX) API — field Core Web Vitals (public origin data)."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

CRUX_API = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"


def _origin_from_url(url: str) -> str:
    p = urlparse(url.strip())
    if not p.scheme or not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}"


def fetch_crux_origin_metrics(origin_or_url: str, api_key: str | None = None) -> dict[str, Any]:
    """
    Fetch origin-level CrUX metrics. API key optional for public quota;
    set CRUX_API_KEY env or pass api_key for higher limits.
    """
    origin = origin_or_url if origin_or_url.startswith("http") else _origin_from_url(origin_or_url)
    if not origin:
        return {"ok": False, "error": "Invalid origin"}

    key = (api_key or "").strip()
    url = f"{CRUX_API}?key={key}" if key else CRUX_API
    body = json.dumps({"origin": origin}).encode("utf-8")
    req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "origin": origin, "error": str(e)}

    record = data.get("record") or {}
    metrics = record.get("metrics") or {}
    parsed: dict[str, Any] = {"origin": origin, "ok": True, "metrics": {}}
    for name, m in metrics.items():
        if not isinstance(m, dict):
            continue
        hist = m.get("histogram") or []
        p75 = m.get("percentiles", {}).get("p75")
        parsed["metrics"][name] = {"p75": p75, "histogram": hist}

    # Pass/fail heuristics (CrUX thresholds)
    lcp = parsed["metrics"].get("largest_contentful_paint", {}).get("p75")
    inp = parsed["metrics"].get("interaction_to_next_paint", {}).get("p75")
    cls = parsed["metrics"].get("cumulative_layout_shift", {}).get("p75")
    parsed["pass"] = {
        "lcp": lcp is not None and float(lcp) <= 2500,
        "inp": inp is not None and float(inp) <= 200,
        "cls": cls is not None and float(cls) <= 0.1,
    }
    return parsed
