"""Tests for Lighthouse audit text normalization."""
from __future__ import annotations

from website_profiling.lighthouse.audit_text import (
    audit_help_text,
    audit_title,
    failure_display_message,
    failure_row_from_audit,
    is_core_web_vitals_failure,
)
from website_profiling.tools.warnings import resolve_impact


def test_audit_help_text_prefers_modern_description():
    audit = {
        "title": "Image elements do not have `[alt]` attributes",
        "description": "Informative elements should aim for short, descriptive alternate text.",
        "helpText": "",
    }
    assert audit_title(audit, "image-alt") == "Image elements do not have `[alt]` attributes"
    assert "Informative elements" in audit_help_text(audit)


def test_failure_display_message_uses_title_when_help_missing():
    msg = failure_display_message({"id": "image-alt", "title": "Image elements do not have alt"})
    assert msg == "Image elements do not have alt"
    assert msg != "image-alt:"


def test_failure_display_message_combines_title_and_help():
    msg = failure_display_message(
        {
            "id": "largest-contentful-paint",
            "title": "Largest Contentful Paint",
            "helpText": "LCP element took too long to load.",
        }
    )
    assert msg.startswith("Largest Contentful Paint:")
    assert "too long" in msg


def test_failure_row_from_audit_normalizes_fields():
    row = failure_row_from_audit(
        "color-contrast",
        {
            "score": 0,
            "title": "Background and foreground colors do not have sufficient contrast ratio",
            "description": "Low-contrast text is difficult to read.",
        },
        category="accessibility",
        impact="Accessibility",
    )
    assert row["title"]
    assert "contrast" in row["helpText"].lower()
    assert row["category"] == "accessibility"


def test_is_core_web_vitals_failure_by_category():
    assert is_core_web_vitals_failure(
        {"id": "render-blocking-resources", "category": "performance", "impact": "LCP"},
        resolve_impact=resolve_impact,
    )
    assert not is_core_web_vitals_failure(
        {"id": "image-alt", "category": "accessibility", "title": "Missing alt", "impact": "Accessibility"},
        resolve_impact=resolve_impact,
    )


def test_is_core_web_vitals_failure_by_impact_when_category_missing():
    assert is_core_web_vitals_failure(
        {"id": "largest-contentful-paint", "title": "LCP slow", "helpText": "Slow LCP"},
        resolve_impact=resolve_impact,
    )
    assert not is_core_web_vitals_failure(
        {"id": "link-name", "title": "Links do not have a discernible name"},
        resolve_impact=resolve_impact,
    )
