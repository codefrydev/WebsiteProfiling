"""Link normalization and extraction."""
from __future__ import annotations

import ast
import math
from urllib.parse import urldefrag, urljoin, urlparse

from bs4 import BeautifulSoup

_TRACKING_PARAM_PREFIXES = ("utm_",)
_FACET_PARAM_NAMES = frozenset({"sort", "filter", "page", "offset", "limit"})


def strip_crawl_query_params(url: str, ignore_params: list[str] | None = None) -> str:
    """Remove tracking and facet query params for crawl deduplication."""
    parsed = urlparse(url)
    if not parsed.query:
        return url.rstrip("/")
    ignore = {p.lower() for p in (ignore_params or [])}
    parts = []
    for pair in parsed.query.split("&"):
        if not pair:
            continue
        key = pair.split("=", 1)[0].lower()
        if key in ignore:
            continue
        if any(key.startswith(p) for p in _TRACKING_PARAM_PREFIXES):
            continue
        if key in _FACET_PARAM_NAMES:
            continue
        parts.append(pair)
    query = "&".join(parts)
    rebuilt = parsed._replace(query=query).geturl()
    return rebuilt.rstrip("/")


def normalize_link(
    base: str,
    href: str,
    strip_params: bool = True,
    ignore_params: list[str] | None = None,
) -> str | None:
    if not href:
        return None
    href = href.strip()
    if href.startswith(("mailto:", "javascript:", "tel:", "data:")):
        return None
    joined = urljoin(base, href)
    joined, _ = urldefrag(joined)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http", "https"):
        return None
    out = joined.rstrip("/")
    if strip_params:
        out = strip_crawl_query_params(out, ignore_params)
    return out


def _parse_rel_flags(rel_raw: str) -> tuple[bool, bool, bool]:
    parts = {p.strip().lower() for p in (rel_raw or "").split() if p.strip()}
    return ("nofollow" in parts, "sponsored" in parts, "ugc" in parts)


_NAV_CLASSES = frozenset({"nav", "menu", "navbar", "navigation"})
_HEADER_CLASSES = frozenset({"header", "site-header", "page-header"})
_FOOTER_CLASSES = frozenset({"footer", "site-footer", "page-footer"})
_SIDEBAR_CLASSES = frozenset({"sidebar", "side", "aside", "widget-area"})


def _classify_position(tag) -> str:
    """Classify where a link sits on the page by walking its ancestor chain."""
    for parent in tag.parents:
        name = getattr(parent, "name", None)
        if name is None:
            continue
        # Semantic HTML5 landmarks (highest priority — unambiguous)
        if name == "nav":
            return "nav"
        if name == "header":
            return "header"
        if name == "footer":
            return "footer"
        if name == "aside":
            return "sidebar"
        # ARIA roles
        role = str(parent.get("role") or "").lower()
        if role in ("navigation", "menubar"):
            return "nav"
        if role == "banner":
            return "header"
        if role == "contentinfo":
            return "footer"
        if role == "complementary":
            return "sidebar"
        # Class / ID heuristics for common naming conventions
        cls_set = {c.lower() for c in (parent.get("class") or [])}
        elem_id = str(parent.get("id") or "").lower()
        if cls_set & _NAV_CLASSES or elem_id in _NAV_CLASSES:
            return "nav"
        if cls_set & _HEADER_CLASSES or elem_id in _HEADER_CLASSES:
            return "header"
        if cls_set & _FOOTER_CLASSES or elem_id in _FOOTER_CLASSES:
            return "footer"
        if cls_set & _SIDEBAR_CLASSES or elem_id in _SIDEBAR_CLASSES:
            return "sidebar"
        if name in ("main", "article", "section"):
            return "content"
    return "content"


def _anchor_text_from_tag(a) -> str:
    parts: list[str] = []
    for child in a.children:
        if getattr(child, "name", None) == "img":
            parts.append("[image]")
        elif isinstance(child, str):
            t = child.strip()
            if t:
                parts.append(t)
    text = " ".join(parts).strip() or a.get_text(separator=" ", strip=True)
    return (text or "")[:500]


def parse_link_edges(base_url: str, html_text: str) -> tuple[str, list[dict]]:
    """Extract title and rich outbound link records from HTML."""
    soup = BeautifulSoup(html_text, "lxml")
    title_tag = (
        soup.title.string.strip()
        if soup.title and soup.title.string
        else ""
    )
    start_netloc = urlparse(base_url).netloc
    edges: list[dict] = []
    for a in soup.find_all("a", href=True):
        ln = normalize_link(base_url, a["href"])
        if not ln:
            continue
        rel_raw = a.get("rel") or ""
        if isinstance(rel_raw, list):
            rel_str = " ".join(str(x) for x in rel_raw)
        else:
            rel_str = str(rel_raw)
        nofollow, sponsored, ugc = _parse_rel_flags(rel_str)
        link_type = "internal" if urlparse(ln).netloc == start_netloc else "external"
        edges.append({
            "to_url": ln.rstrip("/"),
            "anchor_text": _anchor_text_from_tag(a),
            "rel": rel_str.strip(),
            "is_nofollow": nofollow,
            "is_sponsored": sponsored,
            "is_ugc": ugc,
            "link_type": link_type,
            "position": _classify_position(a),
        })
    return title_tag, edges


def parse_links(base_url: str, html_text: str) -> tuple[str, set[str]]:
    """Extract page title and set of absolute links from HTML. Returns (title, links)."""
    title, edges = parse_link_edges(base_url, html_text)
    return title, {e["to_url"] for e in edges}

def _is_empty(raw) -> bool:
    if raw is None:
        return True
    if isinstance(raw, float) and math.isnan(raw):
        return True
    if raw == "":
        return True
    return False


def parse_links_serialized(raw) -> list[str]:
    """
    Parse a serialized list of URLs from CSV/DataFrame (string list repr, comma-separated, or list).
    """
    if _is_empty(raw):
        return []
    if isinstance(raw, list):
        return [str(x).strip().rstrip("/") for x in raw if x]
    s = str(raw).strip()
    if not s:
        return []
    if s.startswith("[") and s.endswith("]"):
        try:
            v = ast.literal_eval(s)
            if isinstance(v, (list, tuple)):
                return [str(x).strip().rstrip("/") for x in v if x]
        except Exception:
            pass
    return [t.strip().rstrip("/") for t in s.split(",") if t.strip()]


# Column names that may contain serialized outlink lists (for building edges from crawl CSV)
LINK_COLUMN_NAMES = (
    "links",
    "edges",
    "outlinks",
    "outlink_targets",
    "targets",
    "link_targets",
    "links_list",
)
