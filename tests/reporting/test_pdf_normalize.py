"""Unit tests for PDF issue normalization and grouping."""
from __future__ import annotations

import pytest

from website_profiling.reporting.pdf.normalize import (
    collapse_duplicate_issues,
    group_issues_for_pdf,
    normalize_issue_for_pdf,
)


def _row(message: str, url: str = "", priority: str = "high", category: str = "Technical SEO",
         recommendation: str = "Fix it") -> dict:
    return {
        "category": category,
        "priority": priority,
        "message": message,
        "url": url,
        "recommendation": recommendation,
        "llm_recommendation": "",
    }


class TestNormalizeIssue:
    def test_url_dedup_from_message(self):
        """URL embedded in message should be stripped from headline."""
        issue = normalize_issue_for_pdf(_row(
            message="URL in sitemap but not crawled: https://codefrydev.in/2048",
            url="https://codefrydev.in/2048",
        ))
        assert "https://codefrydev.in/2048" not in issue.headline
        assert issue.headline == "In sitemap, not crawled"
        assert issue.url == "https://codefrydev.in/2048"

    def test_url_dedup_no_change_when_url_blank(self):
        issue = normalize_issue_for_pdf(_row(
            message="2 page(s) missing viewport meta tag.",
            url="",
        ))
        assert "viewport" in issue.headline
        assert issue.url is None

    def test_lighthouse_cache_insight_label(self):
        issue = normalize_issue_for_pdf(_row(message="cache-insight:", url="https://example.com"))
        assert issue.headline == "Serve assets with efficient cache policy"
        assert "lighthouse" in issue.tags

    def test_lighthouse_color_contrast_label(self):
        issue = normalize_issue_for_pdf(_row(message="color-contrast:", url="https://example.com"))
        assert issue.headline == "Background and foreground colors lack sufficient contrast"

    def test_unknown_lighthouse_id_fallback(self):
        """Unknown audit ids should be title-cased as fallback."""
        issue = normalize_issue_for_pdf(_row(message="my-custom-check:", url="https://example.com"))
        assert issue.headline == "My Custom Check"

    def test_plain_message_unchanged(self):
        issue = normalize_issue_for_pdf(_row(message="Missing H1 on homepage.", url=""))
        assert issue.headline == "Missing H1 on homepage."

    def test_recommendation_included(self):
        issue = normalize_issue_for_pdf(_row(message="issue", recommendation="Do this"))
        assert issue.recommendation == "Do this"

    def test_recommendation_excluded(self):
        issue = normalize_issue_for_pdf(_row(message="issue", recommendation="Do this"),
                                        include_recommendation=False)
        assert issue.recommendation is None

    def test_sitemap_tag_applied(self):
        issue = normalize_issue_for_pdf(_row(message="URL in sitemap but not crawled: https://x.com/p",
                                             url="https://x.com/p"))
        assert "sitemap" in issue.tags

    def test_path_extracted_from_url(self):
        issue = normalize_issue_for_pdf(_row(message="issue", url="https://example.com/blog/post"))
        assert issue.path == "/blog/post"

    def test_path_none_when_url_blank(self):
        issue = normalize_issue_for_pdf(_row(message="issue", url=""))
        assert issue.path is None

    def test_unique_id_generated(self):
        r = _row(message="Missing title", url="https://example.com")
        issue = normalize_issue_for_pdf(r)
        assert len(issue.id) == 12

    def test_same_row_same_id(self):
        r = _row(message="Missing title", url="https://example.com")
        i1 = normalize_issue_for_pdf(r)
        i2 = normalize_issue_for_pdf(r)
        assert i1.id == i2.id

    def test_different_rows_different_id(self):
        r1 = _row(message="Missing title", url="https://example.com")
        r2 = _row(message="Missing title", url="https://other.com")
        assert normalize_issue_for_pdf(r1).id != normalize_issue_for_pdf(r2).id

    def test_generic_cwv_recommendation_shortened(self):
        generic = (
            "See Performance (Core Web Vitals) in this audit, "
            "or re-run Lighthouse from Run audit."
        )
        issue = normalize_issue_for_pdf(_row(message="largest-contentful-paint:", recommendation=generic))
        assert issue.recommendation == "Review Lighthouse audit details for this page."


class TestCollapseDuplicates:
    def test_merges_same_headline_and_fix(self):
        rows = [
            _row("URL in sitemap but not crawled: https://a.com/1", url="https://a.com/1"),
            _row("URL in sitemap but not crawled: https://a.com/2", url="https://a.com/2"),
        ]
        issues = [normalize_issue_for_pdf(r) for r in rows]
        collapsed = collapse_duplicate_issues(issues)
        assert len(collapsed) == 1
        assert collapsed[0].related_urls == ["https://a.com/1", "https://a.com/2"]
        assert "(2 URLs)" in collapsed[0].headline

    def test_keeps_distinct_recommendations_separate(self):
        rows = [
            _row("issue", url="https://a.com/1", recommendation="Fix A"),
            _row("issue", url="https://a.com/2", recommendation="Fix B"),
        ]
        issues = [normalize_issue_for_pdf(r) for r in rows]
        assert len(collapse_duplicate_issues(issues)) == 2

    def test_collapse_in_grouping(self):
        rows = [
            _row(f"URL in sitemap but not crawled: https://a.com/{i}", url=f"https://a.com/{i}")
            for i in range(5)
        ]
        issues = [normalize_issue_for_pdf(r) for r in rows]
        groups = group_issues_for_pdf(issues)
        assert len(groups[0].issues) == 1
        assert len(groups[0].issues[0].related_urls) == 5


class TestGroupIssues:
    def _make_issues(self, specs):
        result = []
        for priority, category, msg in specs:
            row = _row(message=msg, priority=priority, category=category)
            result.append(normalize_issue_for_pdf(row))
        return result

    def test_single_priority_single_group(self):
        issues = self._make_issues([("critical", "Mobile SEO", "Missing viewport")])
        groups = group_issues_for_pdf(issues)
        assert len(groups) == 1
        assert groups[0].id == "findings.critical"
        assert len(groups[0].issues) == 1

    def test_groups_sorted_critical_first(self):
        issues = self._make_issues([
            ("low", "Tech", "thing"),
            ("critical", "Mobile", "viewport"),
            ("high", "Technical SEO", "sitemap"),
        ])
        groups = group_issues_for_pdf(issues)
        priorities = [g.id.split(".")[1] for g in groups]
        assert priorities[0] == "critical"
        assert priorities[1] == "high"
        assert priorities[-1] == "low"

    def test_subgroup_by_category_when_many(self):
        # More than _SUBGROUP_THRESHOLD (8) issues in one priority → sub-groups by category
        issues = self._make_issues(
            [("high", f"Cat{i % 3}", f"Issue {i}") for i in range(12)]
        )
        groups = group_issues_for_pdf(issues)
        # Should have multiple sub-groups under high
        ids = [g.id for g in groups]
        assert any("." in id and id.startswith("findings.high.") for id in ids)

    def test_truncation_applied(self):
        issues = self._make_issues([("low", "Tech", f"issue {i}") for i in range(30)])
        groups = group_issues_for_pdf(issues, issues_per_group=10)
        low_group = next(g for g in groups if "low" in g.id)
        assert low_group.truncation is not None
        assert low_group.truncation.shown == 10
        assert low_group.truncation.total == 30

    def test_total_cap_respected(self):
        issues = self._make_issues([("medium", "Tech", f"m{i}") for i in range(200)])
        groups = group_issues_for_pdf(issues, issues_total=50)
        total_shown = sum(len(g.issues) for g in groups)
        assert total_shown <= 50

    def test_empty_input_returns_empty(self):
        assert group_issues_for_pdf([]) == []

    def test_group_label_includes_count(self):
        issues = self._make_issues([("critical", "Mobile", "viewport")])
        groups = group_issues_for_pdf(issues)
        assert "1 issue" in groups[0].group_label

    def test_list_for_all_groups(self):
        issues = self._make_issues([("low", "Tech", f"x{i}") for i in range(15)])
        groups = group_issues_for_pdf(issues, issues_per_group=20)
        low_group = next(g for g in groups if "low" in g.id)
        assert low_group.render_as == "list"

    def test_list_for_small_group(self):
        issues = self._make_issues([("critical", "Mobile", f"x{i}") for i in range(3)])
        groups = group_issues_for_pdf(issues)
        assert groups[0].render_as == "list"
