"""
Shared helpers for crawler and report/plot scripts (re-export facade).
"""
from .parsing import tech as _tech
from .parsing.content import parse_content_text, parse_social_meta
from .parsing.io import load_dataframe, load_edges, save_dataframe, save_edges
from .parsing.links import (
    LINK_COLUMN_NAMES,
    normalize_link,
    parse_link_edges,
    parse_links,
    parse_links_serialized,
    strip_crawl_query_params,
    _is_empty,
)
from .parsing.robots import load_robots
from .parsing.seo import parse_resources, parse_seo, parse_seo_extended
from .parsing.tech import parse_tech_stack, _is_wappalyzer_regex_warning

_wappalyzer_instance = _tech._wappalyzer_instance
_wappalyzer_disabled = _tech._wappalyzer_disabled


def detect_tech_wappalyzer(url, html, headers, soup, wappalyzer=None):
    """Detect technologies; syncs wappalyzer module state with this facade for tests."""
    _tech._wappalyzer_disabled = _wappalyzer_disabled
    _tech._wappalyzer_instance = _wappalyzer_instance
    result = _tech.detect_tech_wappalyzer(url, html, headers, soup, wappalyzer)
    globals()["_wappalyzer_disabled"] = _tech._wappalyzer_disabled
    globals()["_wappalyzer_instance"] = _tech._wappalyzer_instance
    return result


__all__ = [
    "load_dataframe",
    "save_dataframe",
    "load_edges",
    "save_edges",
    "strip_crawl_query_params",
    "normalize_link",
    "parse_link_edges",
    "parse_links",
    "parse_seo",
    "parse_seo_extended",
    "parse_content_text",
    "parse_social_meta",
    "detect_tech_wappalyzer",
    "parse_tech_stack",
    "parse_resources",
    "parse_links_serialized",
    "load_robots",
    "LINK_COLUMN_NAMES",
    "_is_wappalyzer_regex_warning",
    "_is_empty",
    "_wappalyzer_disabled",
    "_wappalyzer_instance",
]
