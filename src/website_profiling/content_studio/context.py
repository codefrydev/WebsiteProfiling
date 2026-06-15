"""Execution context for Content Studio analyze tools."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ContentStudioContext:
    property_id: int | None
    keyword: str
    body_html: str
    title_tag: str = ""
    meta_description: str = ""
    landing_url: str | None = None
    title: str = ""
