import os


def test_load_config_parses_equals_and_colon_and_ignores_comments(tmp_path) -> None:
    from website_profiling.config import load_config

    p = tmp_path / "cfg.txt"
    p.write_text(
        "\n".join(
            [
                "# comment",
                "start_url = https://example.com",
                "site_name: Example",
                "badline",
                "",
            ]
        ),
        encoding="utf-8",
    )
    cfg = load_config(str(p))
    assert cfg["start_url"] == "https://example.com"
    assert cfg["site_name"] == "Example"
    assert "badline" not in cfg


def test_getters_bool_int_float_list() -> None:
    from website_profiling.config import get_bool, get_float, get_int, get_list, get_str

    cfg = {"b1": "true", "b2": "0", "i": "10", "f": "1.25", "l": " a, b , ,c ", "s": "hello"}
    assert get_str(cfg, "s") == "hello"
    assert get_str(cfg, "missing", "default") == "default"
    assert get_str(cfg, "missing") == ""
    assert get_bool(cfg, "b1", False) is True
    assert get_bool(cfg, "b2", True) is False
    # Missing or empty value honors the default (must not silently disable a default-on flag).
    assert get_bool(cfg, "missing", True) is True
    assert get_bool({"e": ""}, "e", True) is True
    assert get_bool({"e": "   "}, "e", True) is True
    assert get_int(cfg, "i") == 10
    assert get_int(cfg, "missing", 7) == 7
    assert get_int(cfg, "bad", 3) == 3
    assert get_float(cfg, "f") == 1.25
    assert get_float(cfg, "badf", 2.5) == 2.5
    assert get_list(cfg, "l") == ["a", "b", "c"]

