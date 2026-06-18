"""Branch-coverage tests for the PDF pipeline (adapters, normalize, renderers)."""
from __future__ import annotations

from unittest.mock import patch

import pytest

pytest.importorskip("reportlab")

from website_profiling.reporting.pdf.adapters.appendix import adapt_appendix
from website_profiling.reporting.pdf.adapters.findings import adapt_findings
from website_profiling.reporting.pdf.builder import build_pdf_document
from website_profiling.reporting.pdf.document import (
    SCHEMA_VERSION,
    CalloutBlock,
    HeadingBlock,
    IssueGroupBlock,
    IssueTableBlock,
    KeyValueBlock,
    KpiItem,
    KpiRowBlock,
    MarkdownBlock,
    MetricTableBlock,
    ParagraphBlock,
    PdfCoverBlock,
    PdfDocument,
    PdfFooterBlock,
    PdfIssue,
    PdfMeta,
    PdfScoreHero,
    PdfSection,
    PdfTruncation,
    ScoreCard,
    ScoreCardsBlock,
    SpacerBlock,
    StatChip,
    StatGridBlock,
    TableColumn,
    UrlListBlock,
)
from website_profiling.reporting.pdf.normalize import (
    _extract_path,
    _is_lighthouse_row,
    _strip_url_from_headline,
    normalize_issue_for_pdf,
)
from website_profiling.reporting.pdf.options import PdfBuildOptions, PdfLimits
from website_profiling.reporting.pdf.render.html import (
    _render_executive_panel as _html_render_executive_panel,
    _render_stat_grid as _html_render_stat_grid,
    _render_score_cards as _html_render_score_cards,
    _render_block as _html_render_block,
    render_html_document,
)
from website_profiling.reporting.pdf.render.reportlab import (
    _flowables_for_block,
    _make_styles,
    _p,
    _p_html,
    _render_executive_panel as _rl_render_executive_panel,
    _render_top_issues_table,
    _safe_p,
    render_pdf_document,
)


def _row(message: str, **kwargs) -> dict:
    base = {
        "category": "Technical SEO",
        "priority": "high",
        "message": message,
        "url": "",
        "recommendation": "Fix it",
    }
    base.update(kwargs)
    return base


def _issue(**kwargs) -> PdfIssue:
    defaults = {
        "id": "iss001",
        "priority": "high",
        "category": "Technical SEO",
        "headline": "Sample issue",
        "url": "https://example.com/a",
        "path": "/a",
        "recommendation": "Fix it",
    }
    defaults.update(kwargs)
    return PdfIssue(**defaults)


def _minimal_cover(**kwargs) -> PdfCoverBlock:
    defaults = {
        "headline": "Site Audit — example.com",
        "subtitle": "Technical SEO Audit Report",
        "hero": PdfScoreHero(score="80", band="score-good", label="Overall health score"),
        "priority_strip": StatGridBlock(
            id="cover.priority",
            chips=[StatChip(label="High", value="1", tone="high")],
            columns=4,
        ),
        "category_scores": ScoreCardsBlock(
            id="cover.scores",
            cards=[ScoreCard(name="Technical SEO", score="80", issue_count=1, tone="score-good")],
        ),
    }
    defaults.update(kwargs)
    return PdfCoverBlock(**defaults)


def _minimal_meta() -> PdfMeta:
    return PdfMeta(
        report_id=1,
        property="example.com",
        report_title="Technical SEO Audit Report",
        generated_at="18 June 2026",
        exported_at="18 June 2026, 12:00 UTC",
        data_sources=["crawl"],
        health_score=80,
        issue_counts={"critical": 0, "high": 1, "medium": 0, "low": 0},
    )


def _exhaustive_document() -> PdfDocument:
    """Synthetic document exercising every block type and renderer edge path."""
    related = [f"https://example.com/p{i}" for i in range(15)]
    issue_with_urls = _issue(
        headline="Collapsed duplicate",
        related_urls=related,
        url=None,
        recommendation="Consolidate",
    )
    compact_group = IssueGroupBlock(
        id="findings.compact",
        group_label="Medium — compact table",
        issues=[_issue(headline="Compact row", url="https://example.com/c")],
        render_as="compact_table",
        truncation=PdfTruncation(shown=1, total=5),
    )
    list_group = IssueGroupBlock(
        id="findings.list",
        group_label="High — list",
        issues=[issue_with_urls, _issue(url=None, path=None, headline="Site-wide issue")],
    )
    return PdfDocument(
        schema_version=SCHEMA_VERSION,
        document_kind="audit",
        meta=_minimal_meta(),
        cover=_minimal_cover(
            executive_summary="Executive overview text.",
            executive_source="deterministic",
            priorities_list=["Priority one", "Priority two"],
            top_issues=[_issue(priority="critical", headline="Critical item")],
        ),
        sections=[
            PdfSection(
                id="blocks.all",
                section_key="core",
                title="All block types",
                priority=10,
                page_break_before=True,
                source_label="crawl",
                truncation=PdfTruncation(shown=2, total=10),
                blocks=[
                    HeadingBlock(id="h2", text="Section heading", level=2),
                    HeadingBlock(id="h3", text="Sub heading", level=3),
                    ParagraphBlock(id="p", text="Body paragraph"),
                    ParagraphBlock(id="pi", text="Italic note", italic=True),
                    CalloutBlock(id="c-info", text="Info callout", severity="info"),
                    CalloutBlock(id="c-warn", text="Warn callout", severity="warn"),
                    CalloutBlock(id="c-crit", text="Critical callout", severity="critical"),
                    SpacerBlock(id="sp", height_pt=4),
                    KpiRowBlock(id="kpi", items=[KpiItem(label="Pages", value="42")]),
                    StatGridBlock(id="stat", chips=[], columns=4),
                    ScoreCardsBlock(id="scores", cards=[]),
                    KeyValueBlock(id="kv-default", rows=[("Key", "Value")], layout="default"),
                    KeyValueBlock(id="kv-empty", rows=[]),
                    MetricTableBlock(
                        id="metrics",
                        columns=[
                            TableColumn(key="url", label="URL", width="url"),
                            TableColumn(key="val", label="Value", width="wide"),
                        ],
                        rows=[{"url": "https://example.com", "val": "1"}],
                        truncation=PdfTruncation(shown=1, total=3),
                    ),
                    MetricTableBlock(id="metrics-empty", columns=[], rows=[]),
                    UrlListBlock(
                        id="urls",
                        rows=[
                            {"url": "https://example.com", "status": "200", "title": "Home"},
                            {"url": "https://example.com/old", "status": "301", "title": ""},
                            {"url": "https://example.com/missing", "status": "404", "title": "Missing"},
                            {"url": "https://example.com/error", "status": "500", "title": "Error"},
                            {"url": "https://example.com/unknown", "status": "", "title": ""},
                        ],
                        truncation=PdfTruncation(shown=5, total=12),
                    ),
                    UrlListBlock(id="urls-notitle", rows=[{"url": "https://x.com", "status": "200"}], show_title=False),
                    UrlListBlock(id="urls-empty", rows=[]),
                    list_group,
                    compact_group,
                    IssueTableBlock(
                        id="issue-table",
                        title="Issue table",
                        issues=[_issue(headline="Table row")],
                        truncation=PdfTruncation(shown=1, total=4),
                    ),
                    MarkdownBlock(id="md", text="<b>Bold</b> markdown snippet"),
                    ParagraphBlock(id="hidden", text="hidden", visible=False),
                ],
            ),
        ],
        footer=PdfFooterBlock(exported_at="18 June 2026, 12:00 UTC"),
    )


class TestNormalizeBranches:
    def test_strip_url_trailing_slash_variant(self):
        class _Msg(str):
            def replace(self, old, new="", count=-1):
                if old == "https://example.com/page":
                    return str(self)
                return super().replace(old, new, count)

        url = "https://example.com/page"
        msg = _Msg("Not crawled: https://example.com/page/")
        assert url not in _strip_url_from_headline(msg, url)

    def test_extract_path_parse_error(self, monkeypatch):
        def boom(_url):
            raise ValueError("bad url")

        monkeypatch.setattr(
            "website_profiling.reporting.pdf.normalize.urlparse",
            boom,
        )
        assert _extract_path("https://example.com") is None

    def test_lighthouse_tag_detection(self):
        is_lh, audit_id = _is_lighthouse_row("generic message", ["lighthouse"])
        assert is_lh is True
        assert audit_id == ""

    def test_redirect_headline_shortening(self):
        issue = normalize_issue_for_pdf(_row("redirect: 301 to https://example.com/new"))
        assert issue.headline == "301 redirect"
        assert "redirect" in issue.tags

    def test_lighthouse_prefix_stripped(self):
        issue = normalize_issue_for_pdf(_row("lighthouse: Long cache lifetime"))
        assert issue.headline == "Long cache lifetime"

    def test_axe_headline_truncated_at_sentence(self):
        long_body = "A" * 50 + ". " + "B" * 60
        issue = normalize_issue_for_pdf(_row(f"axe: {long_body}"))
        assert issue.headline.endswith(".")
        assert len(issue.headline) < len(long_body)


class TestAdapterAndBuilderBranches:
    def test_appendix_disabled(self):
        payload = {"links": [{"url": "https://example.com", "status": "200"}]}
        assert adapt_appendix(payload, PdfBuildOptions(include_appendix=False)) == []

    def test_findings_empty_groups_after_normalize(self):
        payload = {
            "categories": [{"name": "Tech", "issues": [_row("issue one")]}],
        }
        with patch(
            "website_profiling.reporting.pdf.adapters.findings.group_issues_for_pdf",
            return_value=[],
        ):
            assert adapt_findings(payload, PdfBuildOptions()) == []

    def test_findings_section_truncation_when_over_limit(self):
        issues = [_row(f"issue {i}") for i in range(30)]
        payload = {"categories": [{"name": "Tech", "issues": issues}]}
        opts = PdfBuildOptions(limits=PdfLimits(issues_total=5, issues_per_group=5))
        sections = adapt_findings(payload, opts)
        assert sections[0].truncation is not None
        assert sections[0].truncation.total == 30

    def test_builder_skips_non_dict_categories_and_bad_scores(self):
        payload = {
            "site_name": "example.com",
            "categories": [
                "bad",
                {"name": "Tech", "score": "not-a-number", "issues": []},
            ],
            "links": [],
        }
        doc = build_pdf_document(payload)
        names = [c.name for c in doc.cover.category_scores.cards]
        assert names == ["Tech"]

    def test_builder_prefers_url_for_duplicate_headlines(self):
        payload = {
            "site_name": "example.com",
            "categories": [{
                "name": "Tech",
                "score": 80,
                "issues": [
                    _row("Missing title", url=""),
                    _row("Missing title", url="https://example.com/page"),
                ],
            }],
            "links": [],
        }
        doc = build_pdf_document(payload)
        assert doc.cover.top_issues[0].url == "https://example.com/page"

    def test_builder_skips_unknown_section_adapters(self):
        payload = {"site_name": "example.com", "categories": [], "links": []}
        doc = build_pdf_document(payload, PdfBuildOptions(sections=["missing", "core"]))
        assert any(s.id == "core.audit_details" for s in doc.sections)

    def test_options_custom_sections_override_profile(self):
        opts = PdfBuildOptions(profile="full", sections=["core"])
        assert opts.effective_sections() == ["core"]


class TestRendererBranches:
    def test_html_renders_all_block_types(self):
        html = render_html_document(_exhaustive_document())
        assert "All block types" in html
        assert "status-3xx" in html
        assert "status-4xx" in html
        assert "status-5xx" in html
        assert "status-other" in html
        assert "issue-card" in html
        assert "compact_table" not in html  # render_as is not echoed; table headers are
        assert "Issue</th><th>URL</th>" in html
        assert "Fix:" in html
        assert "and 5 more" in html
        assert "Source: crawl" in html
        assert "Showing 2 of 10 issues" in html

    def test_pdf_renders_all_block_types(self):
        pdf = render_pdf_document(_exhaustive_document())
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 2_000

    def test_reportlab_helper_functions(self):
        st = _make_styles()
        assert _p("plain", st["body"]) is not None
        assert _p_html("<b>markup</b>", st["body"]) is not None
        assert _safe_p("", st["body"]) is not None

    def test_reportlab_empty_executive_and_top_issues(self):
        st = _make_styles()
        cover = _minimal_cover(
            executive_summary=None,
            executive_source=None,
            priorities_list=[],
            top_issues=[],
        )
        assert _rl_render_executive_panel(cover, st) == []
        assert _render_top_issues_table([], st) == []

    def test_reportlab_empty_optional_blocks(self):
        st = _make_styles()
        assert _flowables_for_block(KpiRowBlock(id="k", items=[]), st) == []
        assert _flowables_for_block(StatGridBlock(id="s", chips=[]), st) == []
        assert _flowables_for_block(ScoreCardsBlock(id="sc", cards=[]), st) == []
        assert _flowables_for_block(KeyValueBlock(id="kv", rows=[]), st) == []
        assert _flowables_for_block(UrlListBlock(id="u", rows=[]), st) == []
        assert _flowables_for_block(MetricTableBlock(id="m", columns=[], rows=[]), st) == []
        assert _flowables_for_block(ParagraphBlock(id="h", text="x", visible=False), st) == []

    def test_html_empty_cover_fragments(self):
        doc = PdfDocument(
            schema_version=SCHEMA_VERSION,
            document_kind="audit",
            meta=_minimal_meta(),
            cover=_minimal_cover(
                top_issues=[],
                executive_summary=None,
                executive_source=None,
                priorities_list=[],
                priority_strip=StatGridBlock(id="cover.priority", chips=[], columns=4),
                category_scores=ScoreCardsBlock(id="cover.scores", cards=[]),
            ),
            sections=[],
            footer=PdfFooterBlock(exported_at="now"),
        )
        html = render_html_document(doc)
        assert "Top traffic-impacting issues" not in html
        assert "Category scores" not in html

    def test_html_renderer_empty_helpers(self):
        cover = _minimal_cover(executive_summary=None, priorities_list=[])
        assert _html_render_executive_panel(cover) == ""
        assert _html_render_stat_grid(StatGridBlock(id="s", chips=[], columns=4)) == ""
        assert _html_render_score_cards(ScoreCardsBlock(id="sc", cards=[])) == ""

        class _Unknown:
            type = "unknown"
            visible = True

        assert _html_render_block(_Unknown()) == ""

    def test_reportlab_empty_kv_and_scaled_metric_table(self):
        st = _make_styles()
        assert _flowables_for_block(KeyValueBlock(id="a", rows=[], layout="audit"), st) == []
        assert _flowables_for_block(KeyValueBlock(id="g", rows=[], layout="glossary"), st) == []
        wide = MetricTableBlock(
            id="wide",
            columns=[TableColumn(key=f"c{i}", label=f"C{i}", width="wide") for i in range(8)],
            rows=[{f"c{i}": "x" for i in range(8)}],
        )
        assert _flowables_for_block(wide, st)

        class _Unknown:
            type = "not_registered"
            visible = True

        assert _flowables_for_block(_Unknown(), st) == []
