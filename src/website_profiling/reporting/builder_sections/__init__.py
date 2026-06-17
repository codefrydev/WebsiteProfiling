"""Extracted, self-contained sections of the report builder.

These were split out of ``reporting/builder.py`` to keep that orchestrator
readable. Each is a pure function of the crawl DataFrame (plus already-computed
inputs) and produces one slice of the report payload.
"""
from .content_urls import build_content_url_lists
from .links import build_links_list

__all__ = ["build_content_url_lists", "build_links_list"]
