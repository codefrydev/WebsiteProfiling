"""Technology stack detection."""
from __future__ import annotations

import json
import warnings

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

# Module-level cache for Wappalyzer instance (avoids reloading technologies file per page).
_wappalyzer_instance = None
_wappalyzer_disabled = False


def _is_wappalyzer_regex_warning(msg: str) -> bool:
    lower = msg.lower()
    return "compiling regex" in lower and "unbalanced parenthesis" in lower


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
    global _wappalyzer_instance, _wappalyzer_disabled
    if _wappalyzer_disabled:
        return parse_tech_stack(soup, headers, url)
    try:
        from Wappalyzer import Wappalyzer, WebPage
    except ImportError:
        return parse_tech_stack(soup, headers, url)
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            instance = wappalyzer if wappalyzer is not None else _wappalyzer_instance
            if instance is None:
                instance = Wappalyzer.latest()
                if wappalyzer is None:
                    _wappalyzer_instance = instance
            webpage = WebPage(url, html=html, headers=headers)
            detected = instance.analyze(webpage)
        if any(_is_wappalyzer_regex_warning(str(w.message)) for w in caught):
            _wappalyzer_disabled = True
            _wappalyzer_instance = None
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
