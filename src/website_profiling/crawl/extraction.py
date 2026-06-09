"""Run configured HTML extractors (regex, css, xpath)."""
from __future__ import annotations

import json
import re
from typing import Any

from bs4 import BeautifulSoup


def parse_extractors_config(raw: str | None) -> list[dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(str(raw))
        return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def run_extractors(html: str, extractors: list[dict[str, Any]]) -> dict[str, str]:
    if not html or not extractors:
        return {}
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, str] = {}
    for spec in extractors:
        name = str(spec.get("name") or "").strip()
        if not name:
            continue
        kind = str(spec.get("type") or "regex").strip().lower()
        try:
            if kind == "css":
                sel = str(spec.get("selector") or "").strip()
                if not sel:
                    continue
                el = soup.select_one(sel)
                if el is None:
                    continue
                attr = str(spec.get("attr") or "").strip()
                val = el.get(attr) if attr else el.get_text(strip=True)
                if val:
                    out[name] = str(val)[:500]
            elif kind == "xpath":
                from lxml import html as lxml_html

                expr = str(spec.get("expr") or spec.get("xpath") or "").strip()
                if not expr:
                    continue
                tree = lxml_html.fromstring(html)
                hits = tree.xpath(expr)
                if hits:
                    first = hits[0]
                    val = first if isinstance(first, str) else getattr(first, "text_content", lambda: "")()
                    if val:
                        out[name] = str(val).strip()[:500]
            else:
                pattern = str(spec.get("pattern") or spec.get("regex") or "").strip()
                if not pattern:
                    continue
                match = re.search(pattern, html)
                if match:
                    out[name] = (match.group(1) if match.lastindex else match.group(0))[:500]
        except Exception:
            continue
    return out
