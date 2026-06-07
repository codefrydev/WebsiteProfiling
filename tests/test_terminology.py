"""Report terminology helpers."""
from website_profiling.reporting.terminology import category_display_name


def test_legacy_category_names():
    assert category_display_name("Content intelligence") == "Content quality"
    assert category_display_name("Link Health") == "Links"
    assert category_display_name("Technical SEO") == "Technical SEO"


def test_category_display_name_empty() -> None:
    assert category_display_name("") == ""
    assert category_display_name(None) == ""  # type: ignore[arg-type]
