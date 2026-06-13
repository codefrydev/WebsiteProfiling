"""Content-to-HTML size ratio."""
from __future__ import annotations


def content_html_ratio(body_text: str, raw_html: str) -> float:
    html_len = max(1, len(raw_html or ""))
    return round(len(body_text or "") / html_len * 100, 1)
