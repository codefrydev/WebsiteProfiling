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


_STOP_WORDS = frozenset({
    "the", "and", "for", "that", "this", "with", "from", "your", "have", "are",
    "was", "were", "been", "will", "would", "could", "should", "about", "which",
    "their", "there", "what", "when", "where", "more", "some", "than", "them",
    "other", "into", "over", "also", "just", "after", "before", "only", "then",
    "very", "most", "each", "such", "like", "does", "here", "because", "being",
    "well", "while", "these", "those", "both", "many", "much", "even", "back",
    "through", "still", "between", "every", "under", "last", "long", "great",
    "make", "same", "come", "take", "know", "they", "page", "site", "home",
    "click", "read", "view", "next", "menu", "main", "skip", "content", "link",
    "http", "https", "www", "html", "class", "none", "true", "false", "null",
})


def _count_syllables(word: str) -> int:
    word = word.lower().strip()
    if len(word) <= 3:
        return 1
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def parse_content_text(soup, raw_html: str) -> dict:
    """Extract content analytics: word count, reading level, content-to-HTML ratio, top keywords."""
    import re
    from collections import Counter

    body = soup.find("body")
    body_text = body.get_text(separator=" ", strip=True) if body else ""
    words = [w for w in re.findall(r"[a-zA-Z]+", body_text) if len(w) >= 2]
    word_count = len(words)

    sentences = [s.strip() for s in re.split(r"[.!?]+", body_text) if len(s.strip()) > 5]
    sentence_count = max(1, len(sentences))

    total_syllables = sum(_count_syllables(w) for w in words) if words else 0

    reading_level = 0.0
    if word_count > 30:
        reading_level = (
            0.39 * (word_count / sentence_count)
            + 11.8 * (total_syllables / max(1, word_count))
            - 15.59
        )
        reading_level = max(0.0, min(18.0, round(reading_level, 1)))

    html_len = max(1, len(raw_html))
    content_html_ratio = round(len(body_text) / html_len * 100, 1)

    keyword_words = [w.lower() for w in words if len(w) >= 4 and w.lower() not in _STOP_WORDS]
    top_keywords = Counter(keyword_words).most_common(10)

    return {
        "word_count": word_count,
        "reading_level": reading_level,
        "content_html_ratio": content_html_ratio,
        "top_keywords": json.dumps([{"word": w, "count": c} for w, c in top_keywords]),
    }


def parse_social_meta(soup) -> dict:
    """Extract Open Graph and Twitter Card meta tags."""
    def _meta_content(attrs: dict) -> str:
        tag = soup.find("meta", attrs=attrs)
        return (tag.get("content") or "").strip() if tag else ""

    return {
        "og_title": _meta_content({"property": "og:title"}),
        "og_description": _meta_content({"property": "og:description"}),
        "og_image": _meta_content({"property": "og:image"}),
        "og_type": _meta_content({"property": "og:type"}),
        "twitter_card": _meta_content({"name": "twitter:card"}),
        "twitter_title": _meta_content({"name": "twitter:title"}),
        "twitter_image": _meta_content({"name": "twitter:image"}),
    }


_TECH_PATTERNS = [
    ("WordPress", "html", "/wp-content/"),
    ("WordPress", "html", "/wp-includes/"),
    ("Drupal", "meta_generator", "Drupal"),
    ("Joomla", "meta_generator", "Joomla"),
    ("Shopify", "html", "cdn.shopify.com"),
    ("Squarespace", "html", "squarespace.com"),
    ("Wix", "html", "wix.com"),
    ("Next.js", "html", "__NEXT_DATA__"),
    ("Next.js", "html", "_next/static"),
    ("Nuxt.js", "html", "__NUXT__"),
    ("Gatsby", "html", "gatsby-"),
    ("React", "html", "data-reactroot"),
    ("React", "html", "__REACT_DEVTOOLS"),
    ("React", "html", "react.production.min"),
    ("Vue.js", "html", "__vue"),
    ("Vue.js", "html", "vue.min.js"),
    ("Angular", "html", "ng-version"),
    ("Angular", "html", "ng-app"),
    ("Svelte", "html", "svelte"),
    ("jQuery", "html", "jquery"),
    ("Bootstrap", "html", "bootstrap"),
    ("Tailwind CSS", "html", "tailwindcss"),
    ("Google Analytics", "html", "google-analytics.com/analytics.js"),
    ("Google Analytics", "html", "googletagmanager.com/gtag"),
    ("Google Tag Manager", "html", "googletagmanager.com/gtm.js"),
    ("Facebook Pixel", "html", "connect.facebook.net"),
    ("Hotjar", "html", "hotjar.com"),
    ("Google Fonts", "html", "fonts.googleapis.com"),
    ("Font Awesome", "html", "fontawesome"),
    ("Cloudflare", "header", "cf-ray"),
    ("Nginx", "header_server", "nginx"),
    ("Apache", "header_server", "apache"),
    ("LiteSpeed", "header_server", "litespeed"),
    ("Vercel", "header_server", "vercel"),
    ("Netlify", "header_server", "netlify"),
    ("Amazon CloudFront", "header", "x-amz-cf-id"),
    ("AWS", "header_server", "amazons3"),
]


def parse_tech_stack(soup, headers: dict, url: str) -> str:
    """Detect technologies from HTML patterns and HTTP headers. Returns JSON list of tech names."""
    detected = set()
    html_str = str(soup).lower()
    meta_gen = soup.find("meta", attrs={"name": "generator"})
    generator = (meta_gen.get("content") or "").strip().lower() if meta_gen else ""
    server_header = (headers.get("Server") or headers.get("server") or "").lower()

    for name, source, pattern in _TECH_PATTERNS:
        pat = pattern.lower()
        if source == "html" and pat in html_str:
            detected.add(name)
        elif source == "meta_generator" and pat in generator:
            detected.add(name)
        elif source == "header":
            for v in headers.values():
                if isinstance(v, str) and pat in v.lower():
                    detected.add(name)
                    break
        elif source == "header_server" and pat in server_header:
            detected.add(name)

    return json.dumps(sorted(detected))


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
