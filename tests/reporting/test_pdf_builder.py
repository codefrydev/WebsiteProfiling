"""Tests for build_pdf_document — document structure and metadata."""
from __future__ import annotations

import pytest

from website_profiling.reporting.pdf.builder import build_pdf_document
from website_profiling.reporting.pdf.document import SCHEMA_VERSION, IssueGroupBlock, KeyValueBlock, ScoreCardsBlock
from website_profiling.reporting.pdf.options import PdfBuildOptions


def _base_payload(**overrides) -> dict:
    p = {
        "site_name": "test.example",
        "report_generated_at": "2026-06-18T04:38:27+00:00",
        "categories": [
            {
                "name": "Technical SEO",
                "score": 79,
                "issues": [
                    {
                        "priority": "high",
                        "message": "URL in sitemap but not crawled: https://test.example/page",
                        "url": "https://test.example/page",
                        "recommendation": "Review sitemap",
                    },
                    {
                        "priority": "medium",
                        "message": "Missing canonical URL.",
                        "url": "https://test.example/llms.txt",
                        "recommendation": "Add canonical",
                    },
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
                        "recommendation": "Add viewport",
                    }
                ],
            },
        ],
        "links": [
            {"url": "https://test.example", "status": "200", "title": "Home"},
            {"url": "https://test.example/about", "status": "301", "title": "About"},
        ],
        "report_meta": {"data_sources": ["crawl", "lighthouse"]},
    }
    p.update(overrides)
    return p


class TestDocumentSchema:
    def test_schema_version(self):
        doc = build_pdf_document(_base_payload())
        assert doc.schema_version == SCHEMA_VERSION

    def test_document_kind_audit(self):
        doc = build_pdf_document(_base_payload())
        assert doc.document_kind == "audit"

    def test_meta_property(self):
        doc = build_pdf_document(_base_payload())
        assert doc.meta.property == "test.example"

    def test_meta_issue_counts(self):
        doc = build_pdf_document(_base_payload())
        assert doc.meta.issue_counts["critical"] == 1
        assert doc.meta.issue_counts["high"] == 1
        assert doc.meta.issue_counts["medium"] == 1
        assert doc.meta.issue_counts["low"] == 0

    def test_meta_health_score_present(self):
        doc = build_pdf_document(_base_payload())
        assert doc.meta.health_score is not None
        assert 0 <= doc.meta.health_score <= 100

    def test_footer_generated(self):
        doc = build_pdf_document(_base_payload())
        assert doc.footer.exported_at


class TestCover:
    def test_cover_headline(self):
        doc = build_pdf_document(_base_payload())
        assert doc.cover.headline == "Site Audit — test.example"

    def test_cover_priority_strip_chips(self):
        doc = build_pdf_document(_base_payload())
        chips = {c.label: c.value for c in doc.cover.priority_strip.chips}
        assert chips["Critical"] == "1"
        assert chips["High"] == "1"
        assert chips["Medium"] == "1"
        assert chips["Low"] == "0"

    def test_cover_category_scores(self):
        doc = build_pdf_document(_base_payload())
        names = [c.name for c in doc.cover.category_scores.cards]
        assert "Technical SEO" in names
        assert "Mobile SEO" in names

    def test_cover_top_issues_capped(self):
        payload = _base_payload()
        doc = build_pdf_document(payload, PdfBuildOptions(limits=type("L", (), {"top_issues_cover": 2,
            "issues_total": 120, "issues_per_group": 25, "urls_sample": 20,
            "metric_table_rows": 15, "gsc_queries": 10, "keyword_rows": 15, "diagnostic_items": 20})()))
        assert len(doc.cover.top_issues) <= 2

    def test_cover_top_issues_critical_first(self):
        doc = build_pdf_document(_base_payload())
        if len(doc.cover.top_issues) >= 2:
            assert doc.cover.top_issues[0].priority == "critical"

    def test_cover_executive_summary_present(self):
        payload = _base_payload(executive_summary={
            "source": "deterministic",
            "summary": "Looks good overall.",
            "priorities": ["Fix viewport"],
        })
        doc = build_pdf_document(payload)
        assert doc.cover.executive_summary == "Looks good overall."
        assert doc.cover.priorities_list == ["Fix viewport"]

    def test_cover_executive_summary_none_when_missing(self):
        doc = build_pdf_document(_base_payload())
        # no executive_summary in base payload
        assert doc.cover.executive_summary is None or doc.cover.executive_summary == ""


class TestSections:
    def test_standard_has_findings(self):
        doc = build_pdf_document(_base_payload())
        section_ids = [s.id for s in doc.sections]
        assert "findings" in section_ids

    def test_standard_has_audit_details(self):
        doc = build_pdf_document(_base_payload())
        section_ids = [s.id for s in doc.sections]
        assert "core.audit_details" in section_ids

    def test_category_scores_on_cover_not_in_sections(self):
        doc = build_pdf_document(_base_payload())
        section_ids = [s.id for s in doc.sections]
        assert "core.category_scores" not in section_ids
        assert len(doc.cover.category_scores.cards) >= 1

    def test_standard_has_url_sample(self):
        doc = build_pdf_document(_base_payload())
        section_ids = [s.id for s in doc.sections]
        assert "appendix.urls" in section_ids

    def test_standard_has_glossary(self):
        doc = build_pdf_document(_base_payload())
        section_ids = [s.id for s in doc.sections]
        assert "appendix.glossary" in section_ids

    def test_sections_sorted_by_priority(self):
        doc = build_pdf_document(_base_payload())
        priorities = [s.priority for s in doc.sections]
        assert priorities == sorted(priorities)

    def test_findings_section_has_issue_group_blocks(self):
        doc = build_pdf_document(_base_payload())
        findings = next(s for s in doc.sections if s.id == "findings")
        assert any(isinstance(b, IssueGroupBlock) for b in findings.blocks)

    def test_findings_starts_on_new_page_via_cover_break(self):
        doc = build_pdf_document(_base_payload())
        # Cover ends with explicit page break; findings section should not double-break
        findings = next(s for s in doc.sections if s.id == "findings")
        assert findings.page_break_before is False

    def test_url_sample_truncation(self):
        links = [{"url": f"https://x.com/p{i}", "status": "200", "title": f"P{i}"} for i in range(30)]
        payload = _base_payload(links=links)
        doc = build_pdf_document(payload, PdfBuildOptions())
        url_section = next(s for s in doc.sections if s.id == "appendix.urls")
        url_block = url_section.blocks[0]
        assert len(url_block.rows) == 20  # default limit
        assert url_block.truncation is not None
        assert url_block.truncation.total == 30

    def test_executive_profile_only_cover_sections(self):
        doc = build_pdf_document(_base_payload(), PdfBuildOptions(profile="executive"))
        # executive profile sections = ["core"] only
        section_keys = {s.section_key for s in doc.sections}
        assert "findings" not in [s.id for s in doc.sections]

    def test_no_findings_section_when_no_issues(self):
        payload = _base_payload()
        payload["categories"] = [{"name": "Technical SEO", "score": 100, "issues": []}]
        doc = build_pdf_document(payload)
        section_ids = [s.id for s in doc.sections]
        assert "findings" not in section_ids

    def test_issues_normalized_url_dedup(self):
        doc = build_pdf_document(_base_payload())
        findings = next(s for s in doc.sections if s.id == "findings")
        all_issues = []
        for blk in findings.blocks:
            if isinstance(blk, IssueGroupBlock):
                all_issues.extend(blk.issues)
        sitemap_issue = next(
            (i for i in all_issues if i.headline == "In sitemap, not crawled"), None
        )
        assert sitemap_issue is not None
        # URL must not be embedded in the headline
        if sitemap_issue.url:
            assert sitemap_issue.url not in sitemap_issue.headline


class TestEmptyPayload:
    def test_empty_categories(self):
        doc = build_pdf_document({"site_name": "empty.test", "categories": [], "links": []})
        assert doc.cover.headline == "Site Audit — empty.test"
        assert doc.meta.health_score is None

    def test_empty_links_no_url_section(self):
        doc = build_pdf_document({"site_name": "empty.test", "categories": [], "links": []})
        ids = [s.id for s in doc.sections]
        assert "appendix.urls" not in ids

    def test_missing_keys_no_crash(self):
        doc = build_pdf_document({})
        assert doc.document_kind == "audit"
