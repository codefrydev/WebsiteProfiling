"""
Shared helpers for crawler and report/plot scripts.
"""
from urllib.parse import urljoin, urldefrag, urlparse
import urllib.robotparser as robotparser
import ast
import math

from bs4 import BeautifulSoup


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
