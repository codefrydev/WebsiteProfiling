"""
Shared helpers for crawler and report/plot scripts.
"""
import json
import os
from urllib.parse import urljoin, urldefrag, urlparse
import urllib.robotparser as robotparser
import ast
import math

import pandas as pd
from bs4 import BeautifulSoup


def load_dataframe(path: str) -> pd.DataFrame:
    """Load a DataFrame from CSV or JSON (by extension)."""
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        return pd.read_json(path, orient="records")
    return pd.read_csv(path)


def save_dataframe(df: pd.DataFrame, path: str) -> None:
    """Save a DataFrame to CSV or JSON (by extension). Uses default_handler for JSON to avoid numpy types."""
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        df.to_json(path, orient="records", indent=2, date_format="iso", default_handler=str)
    else:
        df.to_csv(path, index=False)


def load_edges(path: str) -> list[tuple[str, str]]:
    """Load edge list from CSV or JSON (by extension). Returns list of (from_url, to_url)."""
    if not os.path.isfile(path):
        return []
    path_lower = path.lower()
    try:
        if path_lower.endswith(".json"):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return [(str(o.get("from", "")), str(o.get("to", ""))) for o in data if o.get("from") and o.get("to")]
            return []
        edf = pd.read_csv(path)
        if {"from", "to"}.issubset(edf.columns):
            return [(str(a).rstrip("/"), str(b).rstrip("/")) for a, b in edf[["from", "to"]].values]
    except Exception:
        pass
    return []


def save_edges(edges: list[tuple[str, str]], path: str) -> None:
    """Save edge list to CSV or JSON (by extension)."""
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        data = [{"from": a, "to": b} for a, b in edges]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    else:
        pd.DataFrame(edges, columns=["from", "to"]).to_csv(path, index=False)


def normalize_link(base: str, href: str) -> str | None:
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
    return joined.rstrip("/")


def parse_links(base_url: str, html_text: str) -> tuple[str, set[str]]:
    """Extract page title and set of absolute links from HTML. Returns (title, links)."""
    soup = BeautifulSoup(html_text, "lxml")
    title_tag = (
        soup.title.string.strip()
        if soup.title and soup.title.string
        else ""
    )
    links = set()
    for a in soup.find_all("a", href=True):
        ln = normalize_link(base_url, a["href"])
        if ln:
            links.add(ln)
    return title_tag, links


def parse_seo(base_url: str, html_text: str) -> tuple[str, int, str, int, str]:
    """
    Extract SEO-related fields from HTML.
    Returns (meta_description, meta_description_len, h1_text, h1_count, canonical_url).
    """
    soup = BeautifulSoup(html_text, "lxml")
    meta_desc = ""
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        meta_desc = (meta["content"] or "").strip()
    if not meta_desc:
        og = soup.find("meta", attrs={"property": "og:description"})
        if og and og.get("content"):
            meta_desc = (og["content"] or "").strip()
    meta_desc_len = len(meta_desc)

    h1_tags = soup.find_all("h1")
    h1_count = len(h1_tags)
    h1_text = (h1_tags[0].get_text(separator=" ", strip=True) if h1_tags else "") or ""

    canonical_url = ""
    link_canonical = soup.find("link", attrs={"rel": "canonical"})
    if link_canonical and link_canonical.get("href"):
        canonical_url = normalize_link(base_url, link_canonical["href"]) or ""

    return meta_desc, meta_desc_len, h1_text, h1_count, canonical_url


def parse_seo_extended(html_text: str, base_url: str) -> dict:
    """
    Extract extended SEO/accessibility/performance-related fields from HTML.
    Returns a dict with: viewport_present, viewport_content, noindex, has_schema,
    heading_sequence, images_without_alt, images_total, img_without_lazy, img_without_dimensions,
    aria_count, mixed_content_count.
    """
    soup = BeautifulSoup(html_text, "lxml")
    out = {
        "viewport_present": False,
        "viewport_content": "",
        "noindex": False,
        "has_schema": False,
        "heading_sequence": [],
        "images_without_alt": 0,
        "images_total": 0,
        "img_without_lazy": 0,
        "img_without_dimensions": 0,
        "aria_count": 0,
        "mixed_content_count": 0,
    }
    # Viewport
    viewport = soup.find("meta", attrs={"name": "viewport"})
    if viewport and viewport.get("content"):
        out["viewport_present"] = True
        out["viewport_content"] = (viewport["content"] or "").strip()
    # noindex
    robots = soup.find("meta", attrs={"name": "robots"})
    if robots and robots.get("content"):
        content = (robots["content"] or "").lower()
        out["noindex"] = "noindex" in content
    # Structured data: JSON-LD or microdata
    if soup.find("script", type="application/ld+json"):
        out["has_schema"] = True
    if soup.find(attrs={"itemscope": True}):
        out["has_schema"] = True
    # Heading order (h1..h6 only)
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        if tag.name:
            out["heading_sequence"].append(tag.name)
    # Images: alt, lazy, dimensions
    base_scheme = urlparse(base_url).scheme.lower()
    for img in soup.find_all("img"):
        out["images_total"] += 1
        if not img.get("alt") and not img.get("aria-label"):
            out["images_without_alt"] += 1
        loading = (img.get("loading") or "").strip().lower()
        if loading != "lazy":
            out["img_without_lazy"] += 1
        if not img.get("width") and not img.get("height"):
            out["img_without_dimensions"] += 1
        src = img.get("src") or ""
        if base_scheme == "https" and src.strip().lower().startswith("http://"):
            out["mixed_content_count"] += 1
    # ARIA: count elements with any aria- attribute
    for el in soup.find_all(True):
        if getattr(el, "attrs", None) and any(k.startswith("aria-") for k in el.attrs):
            out["aria_count"] += 1
    # Mixed content: links and other src/href
    for tag in soup.find_all(True):
        for attr in ("href", "src", "srcset"):
            val = tag.get(attr)
            if not val or base_scheme != "https":
                continue
            val = str(val).strip().lower()
            if val.startswith("http://"):
                out["mixed_content_count"] += 1
            elif attr == "srcset":
                for part in val.split(","):
                    part = part.strip().split()[0] if part.strip() else ""
                    if part.startswith("http://"):
                        out["mixed_content_count"] += 1
    return out


def parse_resources(html_text: str, base_url: str) -> dict:
    """
    Extract script/link resource counts and total sizes (same-origin only, no fetch).
    Returns dict: script_count, link_stylesheet_count, script_urls, stylesheet_urls
    (URLs for optional later HEAD/GET). Does not fetch; caller may fetch with limit.
    """
    soup = BeautifulSoup(html_text, "lxml")
    parsed_base = urlparse(base_url)
    script_urls = []
    for s in soup.find_all("script", src=True):
        url = normalize_link(base_url, s["src"])
        if url and urlparse(url).netloc == parsed_base.netloc:
            script_urls.append(url)
    stylesheet_urls = []
    for link in soup.find_all("link", rel=lambda r: r and "stylesheet" in (r.lower() if isinstance(r, str) else "")):
        url = link.get("href") and normalize_link(base_url, link["href"])
        if url and urlparse(url).netloc == parsed_base.netloc:
            stylesheet_urls.append(url)
    return {
        "script_count": len(script_urls),
        "link_stylesheet_count": len(stylesheet_urls),
        "script_urls": script_urls,
        "stylesheet_urls": stylesheet_urls,
    }


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


def load_robots(start_url: str):
    """Load robots.txt for the given URL; returns RobotFileParser or None on error."""
    parsed = urlparse(start_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp
    except Exception:
        return None


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
