"""Reporting module coverage for issue impact, link edges, and optional audits."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pandas as pd

from website_profiling.reporting.issue_impact import (
    compute_impact_score,
    enrich_categories_with_traffic_impact,
    sort_issues_by_impact,
)
from website_profiling.reporting.link_edges_report import build_inlink_anchor_matrix, summarize_link_rel
from website_profiling.reporting.optional_audits import (
    amp_audit_issues,
    apply_optional_audits,
    axe_issues_from_df,
    html_validation_issues,
    pagination_issues,
    spell_check_issues,
    wayback_issues,
)

LONG_HTML = "<html><head><title>A</title><title>B</title></head><body>" + ("x" * 120) + "</body></html>"


def test_issue_impact_enriches_and_sorts():
    categories = [
        {
            "id": "seo",
            "issues": [
                {"url": "https://Example.com/Page", "priority": "High"},
                {"url": "https://other.com/", "priority": "Low"},
            ],
        }
    ]
    google = {
        "gsc": {"top_pages": [{"page": "https://example.com/page", "clicks": 3, "impressions": 100}]},
        "ga4": {"top_pages": [{"path": "/page", "sessions": 2}]},
    }
    enrich_categories_with_traffic_impact(categories, google)
    assert categories[0]["issues"][0]["impact_score"] > categories[0]["issues"][1]["impact_score"]
    assert categories[0]["issues"][0]["gsc_clicks"] == 3
    sorted_issues = sort_issues_by_impact(categories[0]["issues"])
    assert sorted_issues[0]["url"].startswith("https://Example.com")


def test_compute_impact_score_defaults():
    assert compute_impact_score("Unknown") >= 1


def test_issue_impact_skips_homepage_ga4_path():
    """GA4 path '/' rstrip('/') is ''; must not match every issue via endswith('')."""
    categories = [{
        "issues": [{"url": "https://example.com/about", "priority": "Medium"}],
    }]
    google = {"ga4": {"top_pages": [{"path": "/", "sessions": 999}]}}
    enrich_categories_with_traffic_impact(categories, google)
    issue = categories[0]["issues"][0]
    assert issue["ga4_sessions"] == 0
    assert issue["impact_score"] == compute_impact_score("Medium")


def test_issue_impact_handles_invalid_rows():
    assert enrich_categories_with_traffic_impact([], []) == []
    enrich_categories_with_traffic_impact(
        [
            "bad",
            {
                "issues": [
                    "bad-issue",
                    {"url": "", "priority": "Low"},
                    {"url": "https://example.com/x", "priority": "Medium"},
                ]
            },
        ],
        {
            "gsc": {"top_pages": ["bad", {"page": "", "clicks": 1}, {"page": "https://example.com/x", "clicks": 2, "impressions": 5}]},
            "ga4": {"top_pages": ["bad", {"path": "", "sessions": 1}, {"path": "/x", "sessions": 4}]},
        },
    )
    assert sort_issues_by_impact(
        [{"priority": "High", "impact_score": 5}, {"priority": "Low", "impact_score": 1}]
    )[0]["impact_score"] == 5


def test_link_edges_matrix_skips_incomplete_edges():
    rows = build_inlink_anchor_matrix(
        [{"from_url": "", "to_url": "https://a.com/x", "anchor_text": "X", "link_type": "internal"}]
    )
    assert rows == []


def test_link_edges_report_summaries():
    edges = [
        {"from_url": "https://a.com/", "to_url": "https://a.com/x", "anchor_text": "X", "link_type": "internal", "is_nofollow": True, "is_sponsored": False, "is_ugc": False},
        {"from_url": "https://a.com/", "to_url": "https://ext.com/", "anchor_text": "Ext", "link_type": "external"},
    ]
    summary = summarize_link_rel(edges)
    assert summary["total_edges"] == 2
    assert summary["nofollow_internal"] == 1
    matrix = build_inlink_anchor_matrix(edges)
    assert matrix[0]["target_url"] == "https://a.com/x"
    assert matrix[0]["inlink_count"] == 1


def test_pagination_amp_mismatch():
    df = pd.DataFrame([
        {
            "url": "https://example.com/page/2",
            "status": "200",
            "canonical_url": "https://example.com/page/2",
            "page_analysis": json.dumps(
                {"pagination": {"rel_prev": "https://example.com/page/1", "rel_next": None, "amphtml": "https://example.com/amp/page/3"}}
            ),
        },
    ])
    issues = pagination_issues(df)
    assert any("amphtml" in i["message"] for i in issues)


def test_spell_html_wayback_and_axe(monkeypatch):
    df = pd.DataFrame([
        {
            "url": "https://example.com/typo",
            "status": "200",
            "content_excerpt": "This sentense has many misspelled wrds that should trigger heuristics.",
            "html": LONG_HTML,
            "page_analysis": json.dumps({"axe_violations": [{"id": "label", "description": "Missing label", "help": "Add label"}]}),
        },
        {"url": "https://example.com/missing", "status": "404", "page_analysis": "{}"},
    ])

    fake_spell = MagicMock()
    fake_spell.unknown.return_value = {"sentense", "wrds", "misspelled", "heuristics"}
    monkeypatch.setitem(__import__("sys").modules, "spellchecker", MagicMock(SpellChecker=lambda: fake_spell))

    spell, _ = spell_check_issues(df, max_pages=5)
    assert spell

    html_issues, _ = html_validation_issues(df)
    assert any("multiple title" in i["message"] for i in html_issues)

    monkeypatch.setattr(
        "website_profiling.reporting.optional_audits.requests.get",
        lambda *a, **k: MagicMock(
            json=lambda: {"archived_snapshots": {"closest": {"available": True, "timestamp": "20200101"}}}
        ),
    )
    wb = wayback_issues(df)
    assert wb

    axe = axe_issues_from_df(df)
    assert axe and "axe:" in axe[0]["message"]


def test_apply_optional_audits_all_flags(monkeypatch):
    categories = [
        {"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []},
        {"id": "intelligence", "name": "Content", "issues": [], "recommendations": []},
        {"id": "html_accessibility", "name": "A11y", "issues": [], "recommendations": []},
    ]
    df = pd.DataFrame([
        {
            "url": "https://example.com/page/2",
            "status": "200",
            "canonical_url": "",
            "content_type": "text/html",
            "content_excerpt": "This sentense has many misspelled wrds that should trigger heuristics.",
            "html": LONG_HTML,
            "page_analysis": json.dumps(
                {
                    "pagination": {"rel_prev": "https://example.com/page/1", "rel_next": None},
                    "axe_violations": [{"id": "label", "description": "Missing label", "help": "Add label"}],
                }
            ),
        },
        {"url": "https://example.com/missing", "status": "404", "page_analysis": "{}"},
    ])

    fake_spell = MagicMock()
    fake_spell.unknown.return_value = {"sentense", "wrds", "misspelled", "heuristics"}
    monkeypatch.setitem(__import__("sys").modules, "spellchecker", MagicMock(SpellChecker=lambda: fake_spell))
    monkeypatch.setattr(
        "website_profiling.reporting.optional_audits.requests.get",
        lambda *a, **k: MagicMock(
            json=lambda: {"archived_snapshots": {"closest": {"available": True, "timestamp": "20200101"}}}
        ),
    )

    meta = apply_optional_audits(
        categories,
        df,
        {
            "enable_spell_check": "true",
            "enable_html_validation": "true",
            "enable_amp_audit": "true",
            "enable_wayback_lookup": "true",
            "enable_axe": "true",
            "crawl_render_mode": "javascript",
        },
    )
    assert meta.get("spell_check_pages", 0) >= 0
    assert categories[0]["issues"]
    assert categories[1]["issues"]
    assert categories[2]["issues"]


def test_optional_audits_empty_inputs():
    assert pagination_issues(pd.DataFrame()) == []
    assert pagination_issues(pd.DataFrame([{"url": "", "page_analysis": "{}"}])) == []
    assert amp_audit_issues(pd.DataFrame()) == []
    assert wayback_issues(pd.DataFrame()) == []
    assert axe_issues_from_df(pd.DataFrame()) == []
    assert axe_issues_from_df(pd.DataFrame([{"url": "https://x.com", "page_analysis": json.dumps({"axe_violations": ["bad"]})}])) == []


def test_optional_audits_edge_branches(monkeypatch):
    from website_profiling.reporting.optional_audits import _parse_page_analysis

    assert _parse_page_analysis({"pagination": {}})["pagination"] == {}
    assert _parse_page_analysis("{bad") == {}
    assert _parse_page_analysis(None) == {}

    pag_df = pd.DataFrame([{"url": "https://x.com", "page_analysis": {"pagination": {"rel_next": "https://x.com/2"}}}])
    assert pagination_issues(pag_df) == []

    dup_html = LONG_HTML + '<div id="a"></div><div id="a"></div>'
    dup_issues, _ = html_validation_issues(pd.DataFrame([{"url": "https://x.com", "html": dup_html}]))
    assert any("duplicate id" in i["message"] for i in dup_issues)

    monkeypatch.setattr(
        "website_profiling.reporting.optional_audits.requests.get",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("network")),
    )
    assert wayback_issues(pd.DataFrame([{"url": "https://x.com/missing", "status": "404"}])) == []


def test_optional_audits_remaining_branches(monkeypatch):
    assert html_validation_issues(pd.DataFrame([{"url": "https://x.com", "html": LONG_HTML}]), max_pages=0)[0] == []
    assert wayback_issues(pd.DataFrame([{"url": "https://x.com/missing", "status": "404"}]), max_lookups=0) == []

    spell_df = pd.DataFrame([
        {"url": "https://x.com/404", "status": "404", "content_excerpt": "long enough excerpt text here for spell checker path testing"},
        {"url": "https://x.com/short", "status": "200", "content_excerpt": "tiny"},
        {"url": "https://x.com/empty", "status": "200", "content_excerpt": "---- ---- ---- ---- ---- ---- ---- ---- ---- ----"},
    ])
    fake_spell = MagicMock()
    fake_spell.unknown.return_value = set()
    monkeypatch.setitem(__import__("sys").modules, "spellchecker", MagicMock(SpellChecker=lambda: fake_spell))
    assert spell_check_issues(spell_df)[0] == []
    assert spell_check_issues(spell_df, max_pages=0)[0] == []

    unclosed_html = "<html><head><title>Only</title></head><body>" + ("y" * 120)
    html_issues, _ = html_validation_issues(pd.DataFrame([{"url": "https://x.com", "html": unclosed_html}]))
    assert any("missing closing html" in i["message"] for i in html_issues)

    amp_ok = pd.DataFrame([
        {"url": "https://example.com/amp/article", "status": "200", "canonical_url": "https://example.com/article", "page_analysis": "{}"},
    ])
    assert amp_audit_issues(amp_ok) == []

    categories = [{"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []}]
    meta = apply_optional_audits(categories, amp_ok, {"enable_amp_audit": "true", "enable_html_validation": "true"})
    assert meta.get("html_validation_parser") in ("regex", "html5lib")
    assert "html_validation_pages" not in meta

    no_a11y = [{"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []}]
    df = pd.DataFrame([{"url": "https://x.com", "status": "200", "page_analysis": "{}"}])
    assert apply_optional_audits(no_a11y, df, {"enable_axe": "true"}) == {}

    from website_profiling.reporting.optional_audits import _accessibility_category, _technical_category

    assert _accessibility_category([{"id": "technical_seo"}]) is None
    assert _technical_category([{"id": "other"}]) is None

    amp_df = pd.DataFrame(
        [{"url": "https://example.com/amp/article", "status": "200", "canonical_url": "", "page_analysis": "{}"}]
    )
    amp_categories = [{"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []}]
    apply_optional_audits(amp_categories, amp_df, {"enable_amp_audit": "true"})
    assert amp_categories[0]["issues"]

    assert wayback_issues(pd.DataFrame([{"url": "", "status": "404"}])) == []


def test_html_validation_html5lib_parser_path(monkeypatch):
    fake_parser = MagicMock()
    fake_parser.parse.side_effect = ValueError("parse fail")
    fake_html5lib = MagicMock()
    fake_html5lib.HTMLParser.return_value = fake_parser
    monkeypatch.setitem(__import__("sys").modules, "html5lib", fake_html5lib)

    html_issues, use_parser = html_validation_issues(
        pd.DataFrame([{"url": "https://x.com", "html": LONG_HTML}])
    )
    assert use_parser is True
    assert any("parser error" in i["message"] for i in html_issues)


def test_amp_canonical_mismatch_and_axe_static_skip():
    amp_df = pd.DataFrame([
        {
            "url": "https://example.com/amp/article",
            "status": "200",
            "canonical_url": "https://example.com/wrong",
            "page_analysis": json.dumps(
                {"pagination": {"amphtml": "https://example.com/article"}}
            ),
        }
    ])
    amp_issues = amp_audit_issues(amp_df)
    assert any("does not match" in i["message"] for i in amp_issues)

    categories = [
        {"id": "html_accessibility", "name": "A11y", "issues": [], "recommendations": []},
    ]
    meta = apply_optional_audits(
        categories,
        pd.DataFrame([{"url": "https://x.com", "status": "200", "page_analysis": "{}"}]),
        {"enable_axe": "true", "crawl_render_mode": "static"},
    )
    assert meta.get("axe_skipped")


def test_reporting_gaps_branch_coverage():
    from website_profiling.reporting.categories._helpers import _indexation_coverage_issues
    from website_profiling.reporting.categories.accessibility import contrast_issues_from_sources
    from website_profiling.reporting.categories.technical_seo import category_technical_seo
    from website_profiling.reporting.content_analytics import _build_tech_stack_summary, _parse_tech_stack_list
    from website_profiling.reporting.seo_summary import _compute_summary_seo_issues
    from website_profiling.reporting.thin_content_helper import count_thin_rows, is_thin_row, thin_content_message

    # 1. _helpers.py: noindex in sitemap >= 15 break
    sitemap = [f"https://x.com/p{i}" for i in range(20)]
    df_noindex = pd.DataFrame([
        {"url": f"https://x.com/p{i}", "status": 200, "noindex": True}
        for i in range(20)
    ])
    indexation = {"sitemap_urls": sitemap}
    issues = _indexation_coverage_issues(df_noindex, indexation)
    assert len([i for i in issues if "sitemap" in i.get("message", "").lower()]) == 15

    # 2. accessibility.py: >= 40 axe issues break
    violations1 = [{"id": "color-contrast", "description": f"desc {i}", "help": "help"} for i in range(25)]
    violations2 = [{"id": "color-contrast", "description": f"desc2 {i}", "help": "help"} for i in range(25)]
    df_axe = pd.DataFrame([
        {"url": "https://x.com/1", "status": 200, "page_analysis": json.dumps({"axe_violations": violations1})},
        {"url": "https://x.com/2", "status": 200, "page_analysis": json.dumps({"axe_violations": violations2})},
    ])
    axe_issues = contrast_issues_from_sources(df_axe, {})
    assert len(axe_issues) == 40

    # 3. technical_seo.py: missing canon > MAX_ISSUES (30), cross canon == url, cross canon > MAX_ISSUES
    rows_canon = []
    # 35 missing canonical
    for i in range(35):
        rows_canon.append({"url": f"https://x.com/missing-{i}", "status": 200, "canonical_url": ""})
    # Same canonical (url == canon)
    rows_canon.append({"url": "https://x.com/same", "status": 200, "canonical_url": "https://x.com/same"})
    # 35 cross canonical
    for i in range(35):
        rows_canon.append({"url": f"https://x.com/cross-{i}", "status": 200, "canonical_url": "https://x.com/other"})
    df_canon = pd.DataFrame(rows_canon)
    tech_res = category_technical_seo(df_canon, {})
    assert any("canonical points to different" in i["message"].lower() for i in tech_res.get("issues", []))

    # 4. content_analytics.py
    assert _parse_tech_stack_list(None) == []
    assert _parse_tech_stack_list({"not": "a list"}) == []
    df_tech = pd.DataFrame([
        {"url": "https://x.com/about", "status": 200, "content_type": "text/html", "tech_stack": '["React"]'},
        {"url": "https://x.com/", "status": 200, "content_type": "text/html", "tech_stack": '["Next.js"]'},
    ])
    summary = _build_tech_stack_summary(df_tech, start_url="https://x.com")
    assert summary.get("homepage_url") == "https://x.com/"

    # 5. seo_summary.py: title_long, meta_desc_long
    df_seo = pd.DataFrame([{
        "url": "https://x.com/long",
        "status": 200,
        "title": "A" * 80,
        "meta_description": "B" * 200,
        "meta_description_len": 200,
        "h1_count": 1,
    }])
    seo_res = _compute_summary_seo_issues(df_seo)
    assert any(i["type"] == "title_long" for i in seo_res.get("issues", {}).get("seo", []))
    assert any(i["type"] == "meta_desc_long" for i in seo_res.get("issues", {}).get("seo", []))

    # 6. thin_content_helper.py
    assert count_thin_rows(pd.DataFrame()) == 0
    assert count_thin_rows(pd.DataFrame([{"status": 500, "word_count": 10}]), success_only=True) == 0
    assert count_thin_rows(pd.DataFrame([{"status": 200, "other": "x"}]), success_only=True) == 0
    assert count_thin_rows(pd.DataFrame([{"status": 200, "word_count": 50}]), success_only=True) == 1
    assert not is_thin_row(pd.Series({"word_count": 300}))
    assert not is_thin_row(pd.Series({"content_length": 2000}))
    assert is_thin_row(pd.Series({"content_length": 100}))
    assert not is_thin_row(pd.Series({}))
    msg1 = thin_content_message(pd.Series({"word_count": 50}))
    assert "50 words" in msg1
    msg2 = thin_content_message(pd.Series({"content_length": 100}))
    assert "100 chars" in msg2
