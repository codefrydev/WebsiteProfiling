"""PDF byte extraction to plain text."""
from __future__ import annotations

import io


def extract_pdf_text(pdf_bytes: bytes) -> dict:
    """Extract text and title metadata from PDF bytes.

    Returns {"text": str, "title": str, "page_count": int}. Never raises —
    encrypted (without a usable empty password), corrupt, or image-only
    (scanned, no extractable text) PDFs return an empty "text" rather than
    an exception, so callers can treat that uniformly as "no content found".
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            if not reader.decrypt(""):
                return {"text": "", "title": "", "page_count": 0}
        parts = [page.extract_text() or "" for page in reader.pages]
        title = ""
        if reader.metadata and reader.metadata.title:
            title = str(reader.metadata.title).strip()
        return {
            "text": "\n".join(parts).strip(),
            "title": title,
            "page_count": len(reader.pages),
        }
    except Exception:
        return {"text": "", "title": "", "page_count": 0}
