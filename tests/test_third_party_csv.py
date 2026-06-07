"""Tests for Moz/Majestic CSV overlay parser."""
from __future__ import annotations

from website_profiling.integrations.links.third_party_csv import (
    build_third_party_overlay,
    parse_third_party_referring_domains,
)


def test_parse_moz_csv_domains() -> None:
    csv_text = "Root Domain,Domain Authority,External Links\nexample.org,45,120\n"
    rows = parse_third_party_referring_domains("moz", csv_text)
    assert len(rows) == 1
    assert rows[0]["domain"] == "example.org"
    assert rows[0]["authority"] == 45.0


def test_overlay_finds_domains_not_in_gsc_sample() -> None:
    csv_text = "Referring domain,Trust Flow,Backlinks\nnewsite.com,20,5\n"
    overlay = build_third_party_overlay("majestic", csv_text, our_domains=["oldsite.com"])
    assert overlay["referring_domain_count"] == 1
    assert overlay["domains_not_in_gsc_count"] == 1
    assert overlay["domains_not_in_gsc_sample"] == ["newsite.com"]
