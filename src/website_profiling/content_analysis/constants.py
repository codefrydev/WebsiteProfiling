"""Shared constants for content analysis."""
from __future__ import annotations

STOP_WORDS = frozenset({
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

# CSS selectors for non-content "chrome" (nav/ads/social/cookie-banners/etc.)
# stripped from the document before content extraction. Deliberately excludes
# bare single-word classes like `.top`, `.menu`, `.widget`, `.language`, since
# those collide with legitimate content-wrapper classes on real sites (a
# metrics/ratio pipeline scoring a whole crawl run is more sensitive to
# false-positive stripping than a one-off content scraper is). Keep that
# tradeoff in mind before broadening this list.
CHROME_SELECTORS = (
    "nav, footer, header, aside, "
    ".navbar, #header, #footer, .sidebar, #sidebar, "
    ".modal, .popup, #modal, .overlay, "
    ".ad, .ads, .advert, #ad, "
    ".lang-selector, #language-selector, .mw-portlet-lang, "
    ".social, .social-media, .social-links, #social, "
    ".navigation, #nav, "
    ".breadcrumbs, #breadcrumbs, "
    ".share, #share, "
    ".cookie, #cookie"
)

# Selectors that identify a page's primary content root. Elements matching
# these are never removed by CHROME_SELECTORS, even if they also match an
# exclude selector (e.g. `<aside id="content">`) — mirrors the candidate
# priority list in main_content.find_main_content.
CONTENT_ROOT_SELECTORS = 'main, article, [role="main"], #content, .content'
