"""Smoke and content regression tests for the PDF renderer.

These tests verify:
  1. Render produces valid PDF bytes.
  2. PDF text contains expected content and does NOT contain the old broken patterns.
  3. The export_audit.export_audit_pdf() entry point is backward-compatible.
"""
from __future__ import annotations

import pytest

pytest.importorskip("reportlab")

from website_profiling.reporting.pdf.builder import build_pdf_document
from website_profiling.reporting.pdf.render import render_pdf_document
from website_profiling.reporting.pdf.options import PdfBuildOptions


def _rich_payload() -> dict:
    return {
        "site_name": "codefrydev.in",
        "report_generated_at": "2026-06-18T04:38:27+00:00",
        "report_meta": {
            "data_sources": ["crawl", "lighthouse", "search_console"],
            "crawl_scope": {
                "pages_crawled": 15,
                "max_pages_configured": 15,
                "crawl_limited": True,
                "render_mode": "javascript",
                "js_concurrency": 3,
            },
        },
        "categories": [
            {
                "name": "Technical SEO",
                "score": 79,
                "issues": [
                    {
                        "priority": "high",
                        "message": "URL in sitemap but not crawled: https://codefrydev.in/2048",
                        "url": "https://codefrydev.in/2048",
                        "recommendation": "Add the page to the crawl scope.",
                    },
                    {
                        "priority": "medium",
                        "message": "Missing canonical URL.",
                        "url": "https://codefrydev.in/llms.txt",
                        "recommendation": "Add <link rel=canonical>.",
                    },
                ],
            },
            {
                "name": "Core Web Vitals",
                "score": 100,
                "issues": [
                    {
                        "priority": "high",
                        "message": "cache-insight:",
                        "url": "https://codefrydev.in",
                        "recommendation": "Add Cache-Control headers.",
                    },
                    {
                        "priority": "high",
                        "message": "color-contrast:",
                        "url": "https://codefrydev.in",
                        "recommendation": "Increase contrast ratio to 4.5:1.",
                    },
                ],
            },
            {
                "name": "Accessibility & markup",
                "score": 69,
                "issues": [
                    {
                        "priority": "medium",
                        "message": (
                            "axe: Ensure the contrast between foreground and background "
                            "colors meets WCAG 2 AA minimum contrast ra"
                        ),
                        "url": "https://codefrydev.in",
                        "recommendation": "Raise text contrast.",
                    }
                ],
            },
            {
                "name": "Mobile SEO",
                "score": 90,
                "issues": [
                    {
                        "priority": "critical",
                        "message": "2 page(s) missing viewport meta tag.",
                        "url": "",
                        "recommendation": "Add <meta name=viewport>.",
                    }
                ],
            },
            {
                "name": "Security",
                "score": 75,
                "issues": [
                    {
                        "priority": "medium",
                        "message": "X-Content-Type-Options header not set.",
                        "url": "https://codefrydev.in",
                        "recommendation": "Add nosniff header.",
                    },
                    {
                        "priority": "medium",
                        "message": "X-Frame-Options header not set.",
                        "url": "https://codefrydev.in",
                        "recommendation": "Add X-Frame-Options: DENY.",
                    },
                ],
            },
        ],
        "links": [
            {"url": "https://codefrydev.in", "status": "200", "title": "CodeFryDev"},
            {"url": "https://codefrydev.in/games", "status": "301", "title": "Games"},
            {"url": "https://codefrydev.in/about-us", "status": "301", "title": "About Us"},
        ],
        "summary": {"total_urls": 15},
        "status_counts": {"301": 12, "200": 3},
        "executive_summary": {
            "source": "deterministic",
            "summary": "Overall health is 87/100. Critical gap: viewport meta missing on 2 pages.",
            "priorities": ["Fix missing viewport meta", "Expand crawl scope to cover sitemap URLs"],
            "top_issues": [
                {"priority": "critical", "message": "Missing viewport meta tag", "url": ""},
            ],
        },
    }


@pytest.fixture(scope="module")
def rendered_pdf() -> bytes:
    payload = _rich_payload()
    doc = build_pdf_document(payload, PdfBuildOptions(profile="standard"))
    return render_pdf_document(doc)


class TestPdfSmoke:
    def test_returns_bytes(self, rendered_pdf):
        assert isinstance(rendered_pdf, bytes)

    def test_pdf_header(self, rendered_pdf):
        assert rendered_pdf[:4] == b"%PDF"

    def test_non_trivial_size(self, rendered_pdf):
        assert len(rendered_pdf) > 1_000

    def test_executive_profile_renders(self):
        payload = _rich_payload()
        doc = build_pdf_document(payload, PdfBuildOptions(profile="executive"))
        pdf = render_pdf_document(doc)
        assert pdf[:4] == b"%PDF"

    def test_empty_payload_renders(self):
        doc = build_pdf_document({"site_name": "empty", "categories": [], "links": []})
        pdf = render_pdf_document(doc)
        assert pdf[:4] == b"%PDF"


class TestPdfContent:
    """Verify content in the PdfDocument model (document level, not raw PDF bytes).

    Content assertions live here because the ReportLab output is FlateDecode
    compressed.  We test the document model which is what drives the render.
    """

    def _get_doc(self):
        return build_pdf_document(_rich_payload(), PdfBuildOptions(profile="standard"))

    def test_site_name_in_cover_headline(self):
        doc = self._get_doc()
        assert "codefrydev.in" in doc.cover.headline

    def test_no_ellipsis_truncation_in_issue_headlines(self):
        """The new normalizer must NOT add '...' truncation that the old renderer applied."""
        from website_profiling.reporting.pdf.document import IssueGroupBlock
        doc = self._get_doc()
        findings = next(s for s in doc.sections if s.id == "findings")
        for blk in findings.blocks:
            if isinstance(blk, IssueGroupBlock):
                for issue in blk.issues:
                    assert not issue.headline.endswith("..."), (
                        f"Headline has hard '...' truncation from old code: {issue.headline!r}"
                    )

    def test_lighthouse_label_expanded_in_headline(self):
        """cache-insight: should be expanded to human label, not left as bare audit id."""
        from website_profiling.reporting.pdf.document import IssueGroupBlock
        doc = self._get_doc()
        findings = next(s for s in doc.sections if s.id == "findings")
        for blk in findings.blocks:
            if isinstance(blk, IssueGroupBlock):
                for issue in blk.issues:
                    assert issue.headline != "cache-insight:", (
                        f"Lighthouse audit id was not expanded: {issue.headline!r}"
                    )

    def test_url_not_duplicated_in_headline(self):
        """Sitemap URLs embedded in message should not appear in headline."""
        from website_profiling.reporting.pdf.document import IssueGroupBlock
        doc = self._get_doc()
        findings = next(s for s in doc.sections if s.id == "findings")
        for blk in findings.blocks:
            if isinstance(blk, IssueGroupBlock):
                for issue in blk.issues:
                    if issue.url:
                        assert issue.url not in issue.headline, (
                            f"URL {issue.url!r} duplicated in headline {issue.headline!r}"
                        )

    def test_glossary_section_present(self):
        doc = self._get_doc()
        from website_profiling.reporting.pdf.document import KeyValueBlock
        gloss_section = next(s for s in doc.sections if s.id == "appendix.glossary")
        gloss_block = next(b for b in gloss_section.blocks if isinstance(b, KeyValueBlock))
        keys = [row[0] for row in gloss_block.rows]
        assert "Crawl" in keys


class TestHtmlPreviewParity:
    def test_html_renders_from_same_document(self):
        from website_profiling.reporting.pdf.render.html import render_html_document
        payload = _rich_payload()
        doc = build_pdf_document(payload, PdfBuildOptions(profile="standard"))
        html_out = render_html_document(doc)
        assert "Site Audit — codefrydev.in" in html_out
        assert "Executive summary" in html_out
        assert "Top traffic-impacting issues" in html_out
        assert "Findings" in html_out
        assert "Audit details" in html_out
        assert "class=\"issue-card" in html_out
        assert "cover-head" in html_out
        assert "grid-table stat-grid" in html_out

    """Ensure export_audit.export_audit_pdf() remains backward-compatible."""

    def test_backward_compat_no_args(self, monkeypatch):
        from website_profiling.tools import export_audit
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: _rich_payload())
        pdf = export_audit.export_audit_pdf()
        assert isinstance(pdf, bytes)
        assert pdf[:4] == b"%PDF"

    def test_backward_compat_report_id(self, monkeypatch):
        from website_profiling.tools import export_audit
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: _rich_payload())
        pdf = export_audit.export_audit_pdf(report_id=42)
        assert pdf[:4] == b"%PDF"

    def test_profile_param_standard(self, monkeypatch):
        from website_profiling.tools import export_audit
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: _rich_payload())
        pdf = export_audit.export_audit_pdf(profile="standard")
        assert pdf[:4] == b"%PDF"

    def test_profile_param_executive(self, monkeypatch):
        from website_profiling.tools import export_audit
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: _rich_payload())
        pdf = export_audit.export_audit_pdf(profile="executive")
        assert pdf[:4] == b"%PDF"

    def test_requires_reportlab(self, monkeypatch):
        from website_profiling.tools import export_audit
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: _rich_payload())

        import builtins
        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "reportlab" or name.startswith("reportlab."):
                raise ImportError("no reportlab")
            return real_import(name, *args, **kwargs)

        with pytest.MonkeyPatch().context() as mp:
            mp.setattr(builtins, "__import__", fake_import)
            with pytest.raises(RuntimeError, match="reportlab"):
                export_audit.export_audit_pdf()

    def test_large_payload_no_crash(self, monkeypatch):
        from website_profiling.tools import export_audit
        issues = [
            {
                "priority": "low",
                "message": "x" * 150,
                "url": "https://example.com/" + ("path/" * 20),
                "recommendation": "fix",
            }
            for _ in range(90)
        ]
        payload = {
            "site_name": "Truncate PDF",
            "categories": [{"name": "Technical SEO", "score": 80, "issues": issues}],
            "links": [],
        }
        monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
        pdf = export_audit.export_audit_pdf()
        assert pdf[:4] == b"%PDF"
