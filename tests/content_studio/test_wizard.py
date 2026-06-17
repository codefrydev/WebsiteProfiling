"""Tests for the Content Studio guided-draft wizard."""
from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch

from website_profiling.content_studio import wizard
from website_profiling.content_studio.wizard import (
    _assemble_body,
    _normalize_options,
    _normalize_outline,
    _normalize_str_list,
    generate_draft,
    research_panel,
    run_wizard_step,
    suggest_content_types,
    suggest_intents,
    suggest_outline,
    suggest_titles,
    suggest_tones,
)


class FakeClient:
    def __init__(self, payload=None, *, raise_exc=False):
        self.payload = payload
        self.raise_exc = raise_exc

    def complete_json(self, system, user):
        if self.raise_exc:
            raise RuntimeError("boom")
        return self.payload


@contextmanager
def ai(client, cfg=None):
    with patch("website_profiling.content_studio.wizard.load_llm_config_from_db", return_value=cfg or {}), patch(
        "website_profiling.content_studio.wizard.llm_is_enabled", return_value=True
    ), patch("website_profiling.content_studio.wizard.get_llm_client", return_value=client):
        yield


# --- gating ---------------------------------------------------------------


def test_disabled_when_llm_off() -> None:
    with patch("website_profiling.content_studio.wizard.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.content_studio.wizard.llm_is_enabled", return_value=False
    ):
        out = run_wizard_step("intents", {"keyword": "best crm"})
    assert out["ok"] is False
    assert "disabled" in out["error"].lower()


def test_disabled_when_content_studio_toggle_off() -> None:
    with patch("website_profiling.content_studio.wizard.load_llm_config_from_db", return_value={"llm_enable_content_studio": "false"}), patch(
        "website_profiling.content_studio.wizard.llm_is_enabled", return_value=True
    ):
        out = suggest_intents("best crm")
    assert out["ok"] is False


def test_every_step_returns_error_when_disabled() -> None:
    with patch("website_profiling.content_studio.wizard.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.content_studio.wizard.llm_is_enabled", return_value=False
    ):
        assert suggest_content_types("k", "i")["ok"] is False
        assert suggest_tones("k", "i", "c")["ok"] is False
        assert suggest_titles("k", "i", "c", "t")["ok"] is False
        assert suggest_outline("k", "i", "c", "t", "T")["ok"] is False
        assert generate_draft("k", "i", "c", "t", "T", [])["ok"] is False
        assert research_panel("k")["ok"] is False


def test_get_client_value_error() -> None:
    with patch("website_profiling.content_studio.wizard.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.content_studio.wizard.llm_is_enabled", return_value=True
    ), patch("website_profiling.content_studio.wizard.get_llm_client", side_effect=ValueError("no provider")):
        out = suggest_intents("best crm")
    assert out["ok"] is False
    assert out["error"] == "no provider"


# --- intents --------------------------------------------------------------


def test_intents_happy_normalizes_mixed_shapes() -> None:
    payload = {"intents": [
        {"label": "Learn", "description": "Understand it"},
        {"name": "How to", "summary": "Do it"},
        "Compare options",
        12345,
    ]}
    with ai(FakeClient(payload)):
        out = suggest_intents("best crm")
    labels = [o["label"] for o in out["options"]]
    assert out["ok"] is True
    assert labels == ["Learn", "How to", "Compare options"]


def test_intents_fallback_on_empty() -> None:
    with ai(FakeClient({})):
        out = suggest_intents("best crm")
    assert out["ok"] is True
    assert any("best crm" in o["label"] for o in out["options"])


def test_intents_keyword_required() -> None:
    with ai(FakeClient({})):
        out = suggest_intents("   ")
    assert out["ok"] is False
    assert out["error"] == "keyword required"


def test_intents_handles_client_exception() -> None:
    with ai(FakeClient(raise_exc=True)):
        out = suggest_intents("best crm")
    assert out["ok"] is True  # falls back


def test_intents_parses_json_string_response() -> None:
    with ai(FakeClient('{"intents":[{"label":"From string"}]}')):
        out = suggest_intents("best crm")
    assert out["options"][0]["label"] == "From string"


# --- content types & tones ------------------------------------------------


def test_content_types_happy_and_fallback() -> None:
    with ai(FakeClient({"content_types": [{"label": "Guide", "description": "d"}]})):
        happy = suggest_content_types("best crm", "Learn about it")
    with ai(FakeClient({})):
        fallback = suggest_content_types("best crm", "Learn about it")
    assert happy["options"][0]["label"] == "Guide"
    assert len(fallback["options"]) == 6


def test_tones_happy_and_fallback() -> None:
    with ai(FakeClient({"tones": [{"label": "Snappy", "description": "d"}]})):
        happy = suggest_tones("best crm", "Learn", "Guide")
    with ai(FakeClient({})):
        fallback = suggest_tones("best crm", "Learn", "Guide")
    assert happy["options"][0]["label"] == "Snappy"
    assert any(o["label"] == "Professional" for o in fallback["options"])


# --- titles ---------------------------------------------------------------


def test_titles_happy_with_strings_and_dicts() -> None:
    with ai(FakeClient({"titles": ["Title A", {"text": "Title B"}, "", 5]})):
        out = suggest_titles("best crm", "Learn", "Guide", "Professional")
    assert out["titles"] == ["Title A", "Title B"]


def test_titles_fallback_when_not_a_list() -> None:
    with ai(FakeClient({"titles": "not a list"})):
        out = suggest_titles("best crm", "Learn", "Guide", "Professional")
    assert out["ok"] is True
    assert any("Complete Guide" in t for t in out["titles"])


# --- outline --------------------------------------------------------------


def test_outline_happy_normalizes_levels_and_drops_h1() -> None:
    payload = {"outline": [
        {"level": "h2", "text": "Section A"},
        {"level": "h3", "text": "Sub B"},
        {"level": "bogus", "text": "Coerced"},
        "Plain section",
        99,
        {"level": "h1", "text": "Should be dropped"},
    ]}
    with ai(FakeClient(payload)):
        out = suggest_outline("best crm", "Learn", "Guide", "Professional", "My Title")
    outline = out["outline"]
    assert outline[0] == {"level": "h1", "text": "My Title"}
    assert {"level": "h2", "text": "Coerced"} in outline
    assert {"level": "h2", "text": "Plain section"} in outline
    assert all(it["text"] != "Should be dropped" for it in outline)


def test_outline_fallback_on_empty() -> None:
    with ai(FakeClient({})):
        out = suggest_outline("best crm", "Learn", "Guide", "Professional", "My Title")
    assert out["outline"][0] == {"level": "h1", "text": "My Title"}
    assert len(out["outline"]) == 7  # h1 + 6 default sections


def test_normalize_outline_title_fallbacks() -> None:
    # No title → first body heading becomes the h1.
    out = _normalize_outline([{"level": "h2", "text": "First"}], "")
    assert out[0]["text"] == "First"
    # Nothing at all → Untitled fallback outline.
    empty = _normalize_outline([], "")
    assert empty[0]["text"] == "Untitled"


def test_normalize_outline_caps_length() -> None:
    raw = [{"level": "h2", "text": f"S{i}"} for i in range(40)]
    out = _normalize_outline(raw, "Title")
    assert len(out) <= 24


def test_normalize_options_and_str_list_non_list() -> None:
    assert _normalize_options("nope") == []
    assert _normalize_str_list({"a": 1}) == []


# --- draft ----------------------------------------------------------------


def test_generate_draft_happy() -> None:
    outline = [{"level": "h2", "text": "Intro"}, {"level": "h3", "text": "Detail"}]
    payload = {"title_tag": "SEO Title", "meta_description": "A meta", "sections": ["Intro prose.", {"text": "Detail prose."}]}
    with ai(FakeClient(payload)):
        out = generate_draft("best crm", "Learn", "Guide", "Professional", "My Title", outline)
    assert out["ok"] is True
    assert out["title_tag"] == "SEO Title"
    assert out["meta_description"] == "A meta"
    body = out["body_html"]
    assert "<h1>My Title</h1>" in body
    assert "<h2>Intro</h2>" in body and "<p>Intro prose.</p>" in body
    assert "<h3>Detail</h3>" in body and "<p>Detail prose.</p>" in body


def test_generate_draft_fallbacks_and_placeholder() -> None:
    outline = [{"level": "h2", "text": "Alpha"}, {"level": "h2", "text": "Beta"}]
    with ai(FakeClient({})):  # no title_tag, meta, or sections
        out = generate_draft("best crm", "Learn", "Guide", "Professional", "My Title", outline)
    assert out["title_tag"] == "My Title"
    assert out["meta_description"].startswith("My Title")
    assert "Add details about alpha here." in out["body_html"]


def test_assemble_body_escapes_and_handles_non_list_sections() -> None:
    body = _assemble_body("Title & Co", [{"level": "h2", "text": "A < B"}], None)
    assert "Title &amp; Co" in body
    assert "A &lt; B" in body
    # Placeholder prose is escaped on the way out (None sections → placeholder path).
    assert "<p>Add details about a &lt; b here.</p>" in body


# --- research -------------------------------------------------------------


def test_research_happy() -> None:
    payload = {
        "questions": ["What is it?", {"text": "How does it work?"}, "", 7],
        "sources": [{"label": "Wikipedia", "description": "Overview"}],
    }
    with ai(FakeClient(payload)):
        out = research_panel("chain reaction", intent="Learn", title="Guide")
    assert out["ok"] is True
    assert out["questions"] == ["What is it?", "How does it work?"]
    assert out["sources"][0]["label"] == "Wikipedia"


def test_research_fallback_on_empty() -> None:
    with ai(FakeClient({})):
        out = research_panel("chain reaction")
    assert out["ok"] is True
    assert any("chain reaction" in q for q in out["questions"])
    assert any(s["label"] == "Wikipedia" for s in out["sources"])


def test_research_keyword_required() -> None:
    with ai(FakeClient({})):
        out = research_panel("  ")
    assert out["ok"] is False
    assert out["error"] == "keyword required"


# --- dispatcher -----------------------------------------------------------


def test_run_wizard_step_all_branches() -> None:
    with ai(FakeClient({})):
        assert run_wizard_step("intents", {"keyword": "best crm"})["ok"] is True
        assert run_wizard_step("content_types", {"keyword": "best crm", "intent": "Learn"})["ok"] is True
        assert run_wizard_step("tones", {"keyword": "k", "intent": "i", "contentType": "Guide"})["ok"] is True
        assert run_wizard_step("titles", {"keyword": "k", "contentType": "Guide", "tone": "Pro"})["ok"] is True
        assert run_wizard_step("outline", {"keyword": "k", "title": "T"})["ok"] is True
        assert run_wizard_step("research", {"keyword": "k", "title": "T"})["ok"] is True
        # outline arrives as a non-list → coerced to [] then normalized to a fallback.
        draft = run_wizard_step("draft", {"keyword": "k", "title": "T", "outline": "bad"})
        assert draft["ok"] is True and draft["body_html"]


def test_run_wizard_step_unknown() -> None:
    out = run_wizard_step("nope", {})
    assert out["ok"] is False
    assert "unknown step" in out["error"]


def test_wizard_module_exposes_run_step() -> None:
    assert hasattr(wizard, "run_wizard_step")
