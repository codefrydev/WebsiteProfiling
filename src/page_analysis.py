"""
Structured on-page analysis from raw HTML: link split, resource inventories, heuristic warnings.
Output is JSON-serializable for crawl_results.page_analysis.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .common import normalize_link

# Max URLs per resource list to limit SQLite / payload size
LIST_CAP = 200
INLINE_SCRIPT_WARN_BYTES = 8192
_HEADING_ORDER = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}


def _cap(lst: list[str]) -> list[str]:
    return lst[:LIST_CAP]


def _visible_anchor_text(a) -> str:
    parts = []
    for child in a.children:
        if getattr(child, "name", None) == "img":
            parts.append("x")  # treat image link as non-empty
        elif isinstance(child, str):
            parts.append(child)
        elif getattr(child, "get_text", None):
            parts.append(child.get_text(separator=" ", strip=True))
    return " ".join(parts).strip()


def _input_has_label(soup, inp) -> bool:
    if (inp.get("aria-label") or "").strip():
        return True
    labelled = (inp.get("aria-labelledby") or "").strip()
    if labelled:
        return True
    if inp.get("type", "").lower() in ("hidden", "submit", "button", "image", "reset"):
        return True
    iid = (inp.get("id") or "").strip()
    if iid and soup.find("label", attrs={"for": iid}):
        return True
    parent = inp.parent
    depth = 0
    while parent and depth < 6:
        if getattr(parent, "name", None) == "label":
            return True
        parent = getattr(parent, "parent", None)
        depth += 1
    return False


def _json_ld_missing_type(data: object) -> bool:
    """True if JSON-LD contains an object that looks like an entity but has no @type."""

    def is_entity_dict(d: dict) -> bool:
        if "@type" in d or ("@context" in d and len(d) == 1):
            return False
        skip = frozenset(("@context", "@id", "@language"))
        return any(k not in skip for k in d)

    def walk(obj: object) -> bool:
        if isinstance(obj, dict):
            if "@graph" in obj:
                if walk(obj["@graph"]):
                    return True
            elif is_entity_dict(obj) and "@type" not in obj:
                return True
            for k, v in obj.items():
                if k == "@graph":
                    continue
                if isinstance(v, (dict, list)) and walk(v):
                    return True
        elif isinstance(obj, list):
            for item in obj:
                if walk(item):
                    return True
        return False

    return walk(data)


def analyze_html(
    html: str,
    page_url: str,
    base_url: str,
    canonical_url: str = "",
) -> dict:
    """
    Parse HTML and return analysis dict with counts, capped URL lists, and warnings.

    page_url: final URL after redirects (used for internal vs external and path checks).
    base_url: used to resolve relative URLs (usually same as page_url).
    canonical_url: resolved canonical href if any (for missing-canonical warning).
    """
    page_url = (page_url or base_url or "").strip()
    base_url = (base_url or page_url).strip()
    parsed_page = urlparse(page_url)
    page_host = (parsed_page.netloc or "").lower()

    out: dict = {
        "internal_link_count": 0,
        "external_link_count": 0,
        "internal_links": [],
        "external_links": [],
        "script_urls": [],
        "stylesheet_urls": [],
        "image_urls": [],
        "preload_count": 0,
        "preconnect_count": 0,
        "third_party_script_count": 0,
        "warnings": [],
    }

    if not html or not page_host:
        return out

    soup = BeautifulSoup(html, "lxml")

    # Resource hints
    for link in soup.find_all("link", href=True):
        rel = link.get("rel")
        rel_set = set()
        if isinstance(rel, list):
            rel_set = {str(r).lower() for r in rel}
        elif rel:
            rel_set = {str(rel).lower()}
        if "preload" in rel_set:
            out["preload_count"] += 1
        if "preconnect" in rel_set or "dns-prefetch" in rel_set:
            out["preconnect_count"] += 1

    internal: list[str] = []
    external: list[str] = []
    seen_a: set[str] = set()

    for a in soup.find_all("a", href=True):
        ln = normalize_link(base_url, a["href"])
        if not ln:
            continue
        if ln in seen_a:
            continue
        seen_a.add(ln)
        host = urlparse(ln).netloc.lower()
        if host == page_host:
            internal.append(ln)
        else:
            external.append(ln)

    out["internal_link_count"] = len(internal)
    out["external_link_count"] = len(external)
    out["internal_links"] = _cap(internal)
    out["external_links"] = _cap(external)

    warnings: list[dict] = []

    def warn(wid: str, severity: str, message: str, detail: str | None = None) -> None:
        w = {"id": wid, "severity": severity, "message": message}
        if detail:
            w["detail"] = detail
        warnings.append(w)

    # Canonical
    if not (canonical_url or "").strip():
        warn("missing_canonical", "medium", "Missing canonical link", "Add a <link rel=\"canonical\"> pointing to the preferred URL.")

    # URL path
    path = parsed_page.path or "/"
    if path != "/" and path.rstrip("/") != path:
        warn("trailing_slash_path", "low", "URL path ends with a trailing slash", page_url)
    if re.search(r"/[A-Z]", path):
        warn("uppercase_path", "low", "URL path contains uppercase characters", path)

    # Headings: skipped levels
    seq = [t.name for t in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]) if t.name]
    prev_tag = None
    for tag in seq:
        if prev_tag:
            pl = _HEADING_ORDER.get(prev_tag, 0)
            cl = _HEADING_ORDER.get(tag, 0)
            if cl > pl + 1:
                warn(
                    "skipped_heading_level",
                    "low",
                    f"Skipped heading level: {prev_tag} to {tag}",
                    "Use sequential heading levels where possible.",
                )
                break
        prev_tag = tag

    head = soup.find("head")

    def _script_in_head(sc) -> bool:
        if not head:
            return False
        for p in sc.parents:
            if p == head:
                return True
        return sc.parent == head

    script_urls: list[str] = []
    third_party = 0
    inline_large = 0

    for s in soup.find_all("script"):
        src = s.get("src")
        if src:
            url = normalize_link(base_url, src)
            if url:
                script_urls.append(url)
                if urlparse(url).netloc.lower() != page_host:
                    third_party += 1
            continue
        # inline
        body = s.string or ""
        if len(body.encode("utf-8")) >= INLINE_SCRIPT_WARN_BYTES:
            inline_large += 1

    if inline_large:
        warn(
            "large_inline_script",
            "medium",
            f"Found {inline_large} large inline script(s)",
            f"Each exceeds ~{INLINE_SCRIPT_WARN_BYTES // 1024} KB; consider external files or splitting.",
        )

    out["third_party_script_count"] = third_party
    if third_party:
        warn(
            "third_party_scripts",
            "low",
            f"Found {third_party} third-party script(s)",
            "Review impact on performance and privacy.",
        )

    for s in soup.find_all("script", src=True):
        url = normalize_link(base_url, s["src"])
        if not url:
            continue
        if urlparse(url).netloc.lower() != page_host:
            continue
        if _script_in_head(s):
            async_ = s.get("async")
            defer = s.get("defer")
            if not async_ and not defer:
                warn(
                    "render_blocking_script",
                    "medium",
                    "Potentially render-blocking script in <head>",
                    url,
                )

    out["script_urls"] = _cap(script_urls)

    stylesheet_urls: list[str] = []
    for link in soup.find_all("link", rel=lambda r: r and "stylesheet" in (r.lower() if isinstance(r, str) else "")):
        href = link.get("href")
        if not href:
            continue
        url = normalize_link(base_url, href)
        if url:
            stylesheet_urls.append(url)
        media = (link.get("media") or "").strip().lower()
        if not media or media == "all":
            if url:
                warn(
                    "stylesheet_blocking_hint",
                    "low",
                    "Stylesheet may block rendering (no restrictive media attribute)",
                    url,
                )

    out["stylesheet_urls"] = _cap(stylesheet_urls)

    image_urls: list[str] = []
    for img in soup.find_all("img", src=True):
        url = normalize_link(base_url, img["src"])
        if url:
            image_urls.append(url)
    out["image_urls"] = _cap(image_urls)

    # JSON-LD
    for idx, sc in enumerate(soup.find_all("script", type=lambda t: t and "ld+json" in str(t).lower())):
        raw = (sc.string or "").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            warn("json_ld_parse", "medium", "Invalid JSON-LD block", f"Block index {idx}")
            continue
        if _json_ld_missing_type(data):
            warn(
                "json_ld_missing_type",
                "medium",
                "JSON-LD may be missing @type on one or more objects",
                "Validate with Rich Results Test; ensure each entity includes @type where required.",
            )
            break

    # Empty anchors
    empty_anchors = 0
    for a in soup.find_all("a", href=True):
        if _visible_anchor_text(a):
            continue
        empty_anchors += 1
    if empty_anchors:
        warn("empty_anchor", "medium", f"Found {empty_anchors} link(s) with no visible text", "Add descriptive text or aria-label.")

    # Form controls without labels
    bad_inputs = 0
    for inp in soup.find_all(["input", "textarea", "select"]):
        if not _input_has_label(soup, inp):
            bad_inputs += 1
    if bad_inputs:
        warn(
            "form_missing_label",
            "medium",
            f"Found {bad_inputs} form control(s) without an associated label",
            "Use <label for=\"id\">, wrap in <label>, or aria-label.",
        )

    out["warnings"] = warnings
    return out
