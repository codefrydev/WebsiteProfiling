"""
Client-facing labels written into report payloads and exports.

Internal category ids (technical_seo, link_health, …) stay stable for code;
`name` fields use vocabulary familiar from Semrush, Screaming Frog, and GSC.
"""

# Audit category titles (stored in payload categories[].name)
CATEGORY_TECHNICAL_SEO = "Technical SEO"
CATEGORY_CORE_WEB_VITALS = "Core Web Vitals"
CATEGORY_PERFORMANCE = "Performance"
CATEGORY_ACCESSIBILITY = "Accessibility & markup"
CATEGORY_LINKS = "Links"
CATEGORY_MOBILE = "Mobile SEO"
CATEGORY_SECURITY = "Security"
CATEGORY_CONTENT_QUALITY = "Content quality"
CATEGORY_SEARCH_PERFORMANCE = "Search performance"

# Older audits may still use legacy names — map for exports and UI fallbacks
LEGACY_CATEGORY_DISPLAY: dict[str, str] = {
    "HTML & Accessibility": CATEGORY_ACCESSIBILITY,
    "HTML/Accessibility": CATEGORY_ACCESSIBILITY,
    "Link Health": CATEGORY_LINKS,
    "Mobile Optimization": CATEGORY_MOBILE,
    "Content intelligence": CATEGORY_CONTENT_QUALITY,
}


def category_display_name(name: str) -> str:
    if not name:
        return ""
    return LEGACY_CATEGORY_DISPLAY.get(name, name)
