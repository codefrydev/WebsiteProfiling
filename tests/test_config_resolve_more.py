import argparse

import pytest


def test_resolve_config_uses_explicit_file(tmp_path) -> None:
    from website_profiling.commands.config_resolve import resolve_config

    p = tmp_path / "c.txt"
    p.write_text("start_url = https://x.com\n", encoding="utf-8")
    args = argparse.Namespace(config=str(p))
    cfg, cwd = resolve_config(args)
    assert cfg["start_url"] == "https://x.com"
    assert cwd == str(tmp_path)


def test_make_path_fn_makes_absolute(tmp_path) -> None:
    from website_profiling.commands.config_resolve import make_path_fn

    cfg = {"p": "rel.txt"}
    fn = make_path_fn(cfg, str(tmp_path))
    assert fn("p", "x").startswith(str(tmp_path))


def test_should_enrich_keywords_after_report_prefers_explicit_flag() -> None:
    from website_profiling.commands.config_resolve import should_enrich_keywords_after_report

    assert should_enrich_keywords_after_report({"enrich_keywords_after_report": "true"}) is True
    assert should_enrich_keywords_after_report({"enrich_keywords_after_report": "false", "enable_google_search_console": "true"}) is False


def test_resolved_lighthouse_url_falls_back_to_start_url() -> None:
    from website_profiling.commands.config_resolve import resolved_lighthouse_url

    assert resolved_lighthouse_url({"start_url": "https://x.com"}) == "https://x.com"
    assert resolved_lighthouse_url({"lighthouse_url": "https://lh.com", "start_url": "https://x.com"}) == "https://lh.com"

