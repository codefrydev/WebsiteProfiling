"""Tests for PDF text extraction and plain-text content analysis."""
from __future__ import annotations

import io

from website_profiling.content_analysis.pdf_extract import extract_pdf_text
from website_profiling.content_analysis.plain_text import analyze_plain_text


def _make_pdf_bytes(text: str = "Hello world test content.", *, title: str | None = None,
                     encrypt_password: str | None = None) -> bytes:
    """Build a minimal single-page PDF with real embedded text, using pypdf's
    own writer (already a project dependency) so the bytes are guaranteed
    spec-compliant — no binary fixture file, no extra test-only dependency."""
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    font_ref = writer._add_object(font)
    resources = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})}
    )
    page[NameObject("/Resources")] = resources
    content = DecodedStreamObject()
    content.set_data(f"BT /F1 24 Tf 72 712 Td ({text}) Tj ET".encode())
    page.replace_contents(content)
    if title:
        writer.add_metadata({"/Title": title})
    if encrypt_password is not None:
        writer.encrypt(encrypt_password)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_extract_pdf_text_returns_text_and_title() -> None:
    pdf_bytes = _make_pdf_bytes("Hello world test content.", title="My Document")
    out = extract_pdf_text(pdf_bytes)
    assert "Hello world test content." in out["text"]
    assert out["title"] == "My Document"
    assert out["page_count"] == 1


def test_extract_pdf_text_handles_corrupt_bytes() -> None:
    assert extract_pdf_text(b"not a pdf") == {"text": "", "title": "", "page_count": 0}


def test_extract_pdf_text_handles_encrypted_pdf_without_password() -> None:
    pdf_bytes = _make_pdf_bytes("secret text", encrypt_password="hunter2")
    out = extract_pdf_text(pdf_bytes)
    assert out == {"text": "", "title": "", "page_count": 0}


def test_analyze_plain_text_counts_words() -> None:
    out = analyze_plain_text("Hello world again and again.")
    assert out["word_count"] > 0
    assert out["reading_level"] >= 0


def test_analyze_plain_text_excludes_content_html_ratio() -> None:
    out = analyze_plain_text("Some plain text content here.")
    assert "content_html_ratio" not in out


def test_analyze_plain_text_excerpt_truncation() -> None:
    words = " ".join(f"word{i}" for i in range(80))
    out = analyze_plain_text(words, excerpt_max_chars=40)
    assert out["content_excerpt"]
    assert len(out["content_excerpt"]) <= 40


def test_batch_analyze_row_dispatches_pdf_to_plain_text(monkeypatch) -> None:
    from website_profiling.content_analysis import batch as ca_batch

    monkeypatch.setattr(
        ca_batch,
        "analyze_page_html",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("must not be called for a PDF row")),
    )
    row = {
        "url": "https://example.com/report.pdf",
        "html": "Annual report plain text content extracted from a PDF.",
        "content_type": "application/pdf",
    }
    out = ca_batch._analyze_row(row, excerpt_max_chars=0, strategy="main_only")
    assert out is not None
    assert out["word_count"] > 0
    assert "content_html_ratio" not in out


def test_batch_analyze_row_still_dispatches_html_normally() -> None:
    from website_profiling.content_analysis import batch as ca_batch

    row = {
        "url": "https://example.com/page",
        "html": "<html><body><main>Some real page content here.</main></body></html>",
        "content_type": "text/html; charset=utf-8",
    }
    out = ca_batch._analyze_row(row, excerpt_max_chars=0, strategy="main_only")
    assert out is not None
    assert "content_html_ratio" in out
