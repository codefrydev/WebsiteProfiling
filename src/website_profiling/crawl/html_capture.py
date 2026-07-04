"""Helpers for deciding whether and how to persist fetched HTML."""
from __future__ import annotations

from typing import Any, Optional


def _is_html_content_type(content_type: str | None) -> bool:
    ct = (content_type or "").lower()
    return "text/html" in ct or "application/xhtml+xml" in ct


def is_pdf_content_type(content_type: str | None) -> bool:
    return "application/pdf" in (content_type or "").lower()


def should_store_page_html(
    *,
    enabled: bool,
    status: Any,
    content_type: str | None,
    html: str | None,
    max_bytes: int,
) -> bool:
    """True when HTML should be persisted for a crawl URL."""
    if not enabled or not html or not str(html).strip():
        return False
    try:
        if int(status) != 200:
            return False
    except (TypeError, ValueError):
        return False
    if not _is_html_content_type(content_type):
        return False
    return len(str(html).encode("utf-8")) <= max(1, int(max_bytes))


def build_page_html_record(
    *,
    url: str,
    html: str,
    status: Any,
    content_type: str | None,
    fetch_method: str,
    max_bytes: int,
    enabled: bool = True,
) -> Optional[dict[str, Any]]:
    """Build a side-channel HTML record, or None if storage should be skipped."""
    if not should_store_page_html(
        enabled=enabled,
        status=status,
        content_type=content_type,
        html=html,
        max_bytes=max_bytes,
    ):
        return None
    text = str(html)
    return {
        "url": str(url or ""),
        "html": text,
        "status": str(status),
        "content_type": str(content_type or ""),
        "fetch_method": str(fetch_method or "static").strip() or "static",
        "byte_length": len(text.encode("utf-8")),
    }


def should_store_page_pdf(
    *,
    enabled: bool,
    status: Any,
    content_type: str | None,
    text: str | None,
) -> bool:
    """True when PDF-extracted text should be persisted for a crawl URL."""
    if not enabled or not text or not str(text).strip():
        return False
    try:
        if int(status) != 200:
            return False
    except (TypeError, ValueError):
        return False
    return is_pdf_content_type(content_type)


def build_page_pdf_record(
    *,
    url: str,
    text: str,
    status: Any,
    content_type: str | None,
    fetch_method: str,
    enabled: bool = True,
) -> Optional[dict[str, Any]]:
    """Build a side-channel record for PDF-extracted text (stored in the same
    ``crawl_page_html`` table, keyed by content_type), or None to skip."""
    if not should_store_page_pdf(
        enabled=enabled, status=status, content_type=content_type, text=text
    ):
        return None
    body = str(text)
    return {
        "url": str(url or ""),
        "html": body,
        "status": str(status),
        "content_type": str(content_type or "application/pdf"),
        "fetch_method": str(fetch_method or "static").strip() or "static",
        "byte_length": len(body.encode("utf-8")),
    }
