"""SEO and resource parsing from HTML."""
from __future__ import annotations

from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .links import normalize_link

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
        "heading_text": [],
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
    # Heading order (h1..h6 tag names) and visible heading copy (for keywords / fingerprints)
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        if tag.name:
            out["heading_sequence"].append(tag.name)
        text = (tag.get_text(separator=" ", strip=True) or "").strip()
        if text:
            out["heading_text"].append(text)
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
        # NOTE: mixed-content for img src/srcset is counted once by the generic
        # href/src/srcset loop below; do not double-count it here.
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
