"""Technology stack detection."""
from __future__ import annotations

import json
import logging
import os
import warnings
from pathlib import Path

logger = logging.getLogger(__name__)

_TECH_PATTERNS = [
    ("WordPress", "html", "/wp-content/"),
    ("WordPress", "html", "/wp-includes/"),
    ("Drupal", "meta_generator", "Drupal"),
    ("Joomla", "meta_generator", "Joomla"),
    ("Hugo", "meta_generator", "Hugo"),
    ("Jekyll", "meta_generator", "Jekyll"),
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
    ("Blazor", "html", "blazor.webassembly.js"),
    ("Blazor", "html", "_framework/blazor"),
    ("jQuery", "html", "jquery"),
    ("Bootstrap", "html", "bootstrap"),
    ("Tailwind CSS", "html", "tailwindcss"),
    ("Webpack", "html", "webpack"),
    ("Google Analytics", "html", "google-analytics.com/analytics.js"),
    ("Google Analytics", "html", "googletagmanager.com/gtag"),
    ("Google Tag Manager", "html", "googletagmanager.com/gtm.js"),
    ("Google Tag Manager", "html", "googletagmanager.com"),
    ("Facebook Pixel", "html", "connect.facebook.net"),
    ("Hotjar", "html", "hotjar.com"),
    ("Microsoft Clarity", "html", "clarity.ms"),
    ("Plausible", "html", "plausible.io"),
    ("Segment", "html", "cdn.segment.com"),
    ("Google Fonts", "html", "fonts.googleapis.com"),
    ("Font Awesome", "html", "fontawesome"),
    ("ASP.NET", "header", "x-aspnet-version"),
    ("ASP.NET", "header", "x-powered-by: asp.net"),
    ("Express", "header", "x-powered-by: express"),
    ("Cloudflare", "header", "cf-ray"),
    ("Cloudflare", "header_server", "cloudflare"),
    ("Nginx", "header_server", "nginx"),
    ("Apache", "header_server", "apache"),
    ("LiteSpeed", "header_server", "litespeed"),
    ("Vercel", "header_server", "vercel"),
    ("Netlify", "header_server", "netlify"),
    ("GitHub Pages", "header_server", "github"),
    ("Azure", "header_server", "microsoft-iis"),
    ("Firebase", "html", "firebaseapp.com"),
    ("Firebase", "html", "firebaseio.com"),
    ("Render", "header_server", "render"),
    ("Railway", "header_server", "railway"),
    ("DigitalOcean", "header_server", "digitalocean"),
    ("Amazon CloudFront", "header", "x-amz-cf-id"),
    ("AWS", "header_server", "amazons3"),
]

# Module-level cache for Wappalyzer instance (avoids reloading technologies file per page).
_wappalyzer_instance = None
_wappalyzer_regex_warned = False

_BUNDLED_TECHNOLOGIES = Path(__file__).resolve().parent / "data" / "technologies.json"


def _technologies_file_path() -> str | None:
    override = (os.environ.get("WAPPALYZER_TECHNOLOGIES_FILE") or "").strip()
    if override:
        return override
    if _BUNDLED_TECHNOLOGIES.is_file():
        return str(_BUNDLED_TECHNOLOGIES)
    return None


def reset_wappalyzer_state() -> None:
    """Clear cached Wappalyzer instance (call at crawl start)."""
    global _wappalyzer_instance, _wappalyzer_regex_warned
    _wappalyzer_instance = None
    _wappalyzer_regex_warned = False


def _is_wappalyzer_regex_warning(msg: str) -> bool:
    lower = msg.lower()
    return "compiling regex" in lower and "unbalanced parenthesis" in lower


def _load_wappalyzer_instance(wappalyzer=None):
    if wappalyzer is not None:
        return wappalyzer
    global _wappalyzer_instance
    if _wappalyzer_instance is not None:
        return _wappalyzer_instance
    from Wappalyzer import Wappalyzer

    tech_file = _technologies_file_path()
    _wappalyzer_instance = (
        Wappalyzer.latest(technologies_file=tech_file)
        if tech_file
        else Wappalyzer.latest()
    )
    return _wappalyzer_instance


def detect_tech_wappalyzer(
    url: str,
    html: str,
    headers: dict,
    soup,
    wappalyzer=None,
) -> str:
    """
    Detect technologies using python-Wappalyzer from existing HTML and headers.
    Returns JSON list of tech names. On any failure, falls back to parse_tech_stack(soup, headers, url).
    """
    global _wappalyzer_regex_warned
    try:
        from Wappalyzer import WebPage
    except ImportError:
        return parse_tech_stack(soup, headers, url)
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            instance = _load_wappalyzer_instance(wappalyzer)
            webpage = WebPage(url, html=html, headers=headers)
            detected = instance.analyze(webpage)
        if any(_is_wappalyzer_regex_warning(str(w.message)) for w in caught):
            if not _wappalyzer_regex_warned:
                logger.warning(
                    "Wappalyzer regex warning on %s; falling back to pattern matcher for this page",
                    url,
                )
                _wappalyzer_regex_warned = True
            return parse_tech_stack(soup, headers, url)
        return json.dumps(sorted(detected))
    except Exception:
        return parse_tech_stack(soup, headers, url)


def parse_tech_stack(soup, headers: dict, url: str) -> str:
    """Detect technologies from HTML patterns and HTTP headers. Returns JSON list of tech names."""
    detected = set()
    html_str = str(soup).lower()
    meta_gen = soup.find("meta", attrs={"name": "generator"})
    generator = (meta_gen.get("content") or "").strip().lower() if meta_gen else ""
    server_header = (headers.get("Server") or headers.get("server") or "").lower()
    powered_by = (headers.get("X-Powered-By") or headers.get("x-powered-by") or "").lower()

    for name, source, pattern in _TECH_PATTERNS:
        pat = pattern.lower()
        if source == "html" and pat in html_str:
            detected.add(name)
        elif source == "meta_generator" and pat in generator:
            detected.add(name)
        elif source == "header":
            if pat.startswith("x-powered-by:"):
                if pat.split(":", 1)[1].strip() in powered_by:
                    detected.add(name)
            else:
                for v in headers.values():
                    if isinstance(v, str) and pat in v.lower():
                        detected.add(name)
                        break
        elif source == "header_server" and pat in server_header:
            detected.add(name)

    return json.dumps(sorted(detected))
