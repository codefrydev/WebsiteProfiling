"""Roadmap extras: competitor CSV gap, audit summary, SERP overlay helpers."""
from unittest.mock import patch

from website_profiling.integrations.google.competitor_links import (
    build_competitor_domain_gap,
    parse_referring_domains_from_csv,
)
from website_profiling.llm_client_http import generate_audit_executive_summary


def test_parse_referring_domains_from_csv() -> None:
    csv_text = "Site,Links\nexample.com,5\nother.org,2\n"
    domains = parse_referring_domains_from_csv(csv_text)
    assert "example.com" in domains
    assert "other.org" in domains


def test_build_competitor_domain_gap() -> None:
    our = {"alpha.com", "beta.io"}
    refs = ["gamma.net", "alpha.com", "delta.co"]
    gap = build_competitor_domain_gap(our, "rival.com", refs)
    assert gap["competitor"] == "rival.com"
    assert gap["gap_count"] == 2
    assert "gamma.net" in gap["gap_domains"]
    assert "delta.co" in gap["gap_domains"]


def test_executive_summary_deterministic() -> None:
    payload = {
        "categories": [
            {"name": "SEO", "score": 80, "issues": [{"message": "Missing title", "url": "https://x.com/a", "priority": "High"}]},
        ],
        "google": {"gsc": {"top_pages": [{"page": "https://x.com/a", "clicks": 100}]}},
        "summary": {"total_urls": 10},
    }
    summary_text = "Prioritize fixes below by severity and Search Console traffic impact."
    with patch(
        "website_profiling.llm_client_http._post",
        return_value={
            "ok": True,
            "source": "deterministic",
            "summary": summary_text,
            "top_issues": payload["categories"][0]["issues"],
            "priorities": [],
        },
    ):
        result = generate_audit_executive_summary(payload, {})
    assert result["ok"] is True
    assert result["source"] == "deterministic"
    assert len(result["top_issues"]) >= 1
    assert isinstance(result["summary"], str)
    assert "Prioritize fixes below" in result["summary"]


def test_executive_summary_empty_payload() -> None:
    with patch(
        "website_profiling.llm_client_http._post",
        return_value={"ok": True, "source": "deterministic", "summary": "No audit data.", "top_issues": [], "priorities": []},
    ):
        result = generate_audit_executive_summary({}, {})
    assert result["ok"] is True
    assert result["source"] == "deterministic"
    assert isinstance(result["summary"], str)
