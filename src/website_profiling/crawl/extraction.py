"""Run configured HTML extractors (regex, css, xpath, llm)."""
from __future__ import annotations

import json
import re
from typing import Any, Callable, Optional

from bs4 import BeautifulSoup

LlmResolver = Callable[[dict[str, Any], str], Optional[dict[str, Any]]]


def parse_extractors_config(raw: str | None) -> list[dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(str(raw))
        return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _execute_selector(spec: dict[str, Any], soup: BeautifulSoup, html: str) -> Optional[str]:
    """Run a resolved css/xpath spec (never 'llm' — that's resolved to one of
    these two before reaching here) and return its extracted value, or None."""
    kind = str(spec.get("type") or "").strip().lower()
    if kind == "css":
        sel = str(spec.get("selector") or "").strip()
        if not sel:
            return None
        el = soup.select_one(sel)
        if el is None:
            return None
        attr = str(spec.get("attr") or "").strip()
        val = el.get(attr) if attr else el.get_text(strip=True)
        return str(val)[:500] if val else None
    if kind == "xpath":
        from lxml import html as lxml_html

        expr = str(spec.get("expr") or spec.get("xpath") or "").strip()
        if not expr:
            return None
        tree = lxml_html.fromstring(html)
        hits = tree.xpath(expr)
        if not hits:
            return None
        first = hits[0]
        val = first if isinstance(first, str) else getattr(first, "text_content", lambda: "")()
        return str(val).strip()[:500] if val else None
    return None


def run_extractors(
    html: str,
    extractors: list[dict[str, Any]],
    *,
    llm_resolver: Optional[LlmResolver] = None,
) -> dict[str, str]:
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
            if kind in ("css", "xpath"):
                val = _execute_selector(spec, soup, html)
                if val:
                    out[name] = val
            elif kind == "llm":
                if llm_resolver is None:
                    continue
                resolved = llm_resolver(spec, html)
                if resolved is None:
                    continue
                val = _execute_selector(resolved, soup, html)
                if val:
                    out[name] = val
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
