"""Tests for LLM-bootstrapped, cached custom-extractor selectors."""
from __future__ import annotations

import json
from contextlib import contextmanager

import pytest

from website_profiling.crawl import llm_selector_cache as lsc


class _FakeCache:
    """In-memory stand-in for the llm_cache table."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.write_count = 0

    def read(self, _conn, key: str):
        return self.store.get(key)

    def write(self, _conn, key: str, value: str) -> None:
        self.write_count += 1
        self.store[key] = value


@pytest.fixture()
def fake_cache(monkeypatch):
    cache = _FakeCache()

    @contextmanager
    def _fake_db_session():
        yield object()

    monkeypatch.setattr(lsc, "db_session", _fake_db_session)
    monkeypatch.setattr(lsc, "read_llm_cache", cache.read)
    monkeypatch.setattr(lsc, "write_llm_cache", cache.write)
    return cache


def test_cache_key_is_deterministic_and_domain_scoped():
    key1 = lsc.build_selector_cache_key(domain="example.com", field_name="price", description="the price")
    key2 = lsc.build_selector_cache_key(domain="example.com", field_name="price", description="the price")
    key3 = lsc.build_selector_cache_key(domain="other.com", field_name="price", description="the price")
    assert key1 == key2
    assert key1 != key3


def test_cache_key_domain_is_case_insensitive():
    key1 = lsc.build_selector_cache_key(domain="Example.com", field_name="price", description="the price")
    key2 = lsc.build_selector_cache_key(domain="example.com", field_name="price", description="the price")
    assert key1 == key2


def test_bootstrap_calls_ai_service_once_then_caches(monkeypatch, fake_cache):
    calls = []

    def fake_generate(field_name, description, html_samples, *, previous_selector=None, previous_selector_failed=False):
        calls.append((field_name, description, tuple(html_samples)))
        return {"ok": True, "type": "css", "selector": ".price", "attr": "", "confidence": 0.9, "rationale": "r"}

    monkeypatch.setattr(lsc, "generate_extraction_selector", fake_generate)
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    assert resolver is not None

    html = '<html><body><span class="price">$9.99</span></body></html>'
    spec = {"name": "price", "type": "llm", "description": "the product price"}

    first = resolver(spec, html)
    second = resolver(spec, html)

    assert first == second
    assert first["selector"] == ".price"
    assert len(calls) == 1  # second call hit the cache, no second AI call
    assert fake_cache.write_count == 1


def test_repair_triggers_exactly_once_then_gives_up(monkeypatch, fake_cache):
    # Seed the cache with a selector that does NOT match any of our fixture pages.
    key = lsc.build_selector_cache_key(domain="example.com", field_name="price", description="the price")
    fake_cache.store[key] = json.dumps({"type": "css", "selector": ".stale-price", "attr": "", "repair_count": 0})

    ai_calls = []

    def fake_generate(field_name, description, html_samples, *, previous_selector=None, previous_selector_failed=False):
        ai_calls.append(previous_selector_failed)
        # The AI "also can't fix it" — still returns a non-matching selector.
        return {"ok": True, "type": "css", "selector": ".still-stale", "attr": ""}

    monkeypatch.setattr(lsc, "generate_extraction_selector", fake_generate)
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})

    spec = {"name": "price", "type": "llm", "description": "the price"}
    html = '<html><body><span class="price">$9.99</span></body></html>'

    for _ in range(3):
        result = resolver(spec, html)
        assert result is None

    assert ai_calls == [True]  # exactly one repair attempt, ever
    cached_after = json.loads(fake_cache.store[key])
    assert cached_after["repair_count"] == 1


def test_field_present_on_later_page_after_cache_hit_needs_no_ai_call(monkeypatch, fake_cache):
    key = lsc.build_selector_cache_key(domain="example.com", field_name="price", description="the price")
    fake_cache.store[key] = json.dumps({"type": "css", "selector": ".price", "attr": "", "repair_count": 0})
    monkeypatch.setattr(
        lsc,
        "generate_extraction_selector",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call AI on a cache hit")),
    )
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    html = '<html><body><span class="price">$19.99</span></body></html>'
    result = resolver({"name": "price", "type": "llm", "description": "the price"}, html)
    assert result["selector"] == ".price"


def test_llm_disabled_returns_no_resolver(monkeypatch, fake_cache):
    monkeypatch.setattr(
        lsc,
        "generate_extraction_selector",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call AI when disabled")),
    )
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "false"})
    assert resolver is None


def test_bootstrap_uses_domain_scoped_samples_from_crawl_page_html(monkeypatch, fake_cache):
    sample_rows = [{"html": "<html>sample one</html>"}, {"html": "<html>sample two</html>"}]
    monkeypatch.setattr(lsc, "read_page_html_for_run", lambda _conn, _run_id, limit=3: sample_rows[:limit])

    seen_samples = []

    def fake_generate(field_name, description, html_samples, **kwargs):
        seen_samples.extend(html_samples)
        return {"ok": True, "type": "css", "selector": ".x", "attr": ""}

    monkeypatch.setattr(lsc, "generate_extraction_selector", fake_generate)
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=42, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    resolver({"name": "x", "type": "llm", "description": "x field"}, "<html>current page, does not match .x</html>")
    assert seen_samples == ["<html>sample one</html>", "<html>sample two</html>"]


def test_bootstrap_falls_back_to_current_page_when_no_run_id(monkeypatch, fake_cache):
    seen_samples = []

    def fake_generate(field_name, description, html_samples, **kwargs):
        seen_samples.extend(html_samples)
        return {"ok": True, "type": "css", "selector": ".x", "attr": ""}

    monkeypatch.setattr(lsc, "generate_extraction_selector", fake_generate)
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    resolver({"name": "x", "type": "llm", "description": "x field"}, "<html>only this page</html>")
    assert seen_samples == ["<html>only this page</html>"]


def test_generate_and_cache_rejects_malformed_ai_response(monkeypatch, fake_cache):
    monkeypatch.setattr(
        lsc, "generate_extraction_selector", lambda *a, **k: {"ok": True, "type": "regex", "selector": ".x"}
    )
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    result = resolver({"name": "x", "type": "llm", "description": "x field"}, "<html>page</html>")
    assert result is None
    assert fake_cache.write_count == 0


def test_selector_matches_returns_false_on_execution_error():
    # A malformed selector spec (not a dict shape _execute_selector expects)
    # must degrade to "no match", never raise out of the resolver.
    assert lsc._selector_matches(None, "<html></html>") is False  # type: ignore[arg-type]


def test_load_bootstrap_html_samples_falls_back_when_db_raises(monkeypatch):
    @contextmanager
    def _boom_db_session():
        raise RuntimeError("db unavailable")
        yield  # pragma: no cover - unreachable, satisfies generator shape

    monkeypatch.setattr(lsc, "db_session", _boom_db_session)
    samples = lsc._load_bootstrap_html_samples(7, "<html>current page</html>")
    assert samples == ["<html>current page</html>"]


def test_read_cached_spec_returns_none_when_db_raises(monkeypatch):
    @contextmanager
    def _boom_db_session():
        raise RuntimeError("db unavailable")
        yield  # pragma: no cover - unreachable, satisfies generator shape

    monkeypatch.setattr(lsc, "db_session", _boom_db_session)
    assert lsc._read_cached_spec("some-key") is None


def test_read_cached_spec_returns_none_on_malformed_json(fake_cache):
    fake_cache.store["some-key"] = "{not valid json"
    assert lsc._read_cached_spec("some-key") is None


def test_write_cached_spec_swallows_db_errors(monkeypatch):
    @contextmanager
    def _boom_db_session():
        raise RuntimeError("db unavailable")
        yield  # pragma: no cover - unreachable, satisfies generator shape

    monkeypatch.setattr(lsc, "db_session", _boom_db_session)
    lsc._write_cached_spec("some-key", {"type": "css", "selector": ".x"})  # must not raise


def test_generate_and_cache_returns_none_when_ai_reports_not_ok(monkeypatch, fake_cache):
    monkeypatch.setattr(lsc, "generate_extraction_selector", lambda *a, **k: {"ok": False, "error": "boom"})
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    result = resolver({"name": "x", "type": "llm", "description": "x field"}, "<html>page</html>")
    assert result is None
    assert fake_cache.write_count == 0


def test_resolver_skips_spec_missing_name_or_description(monkeypatch, fake_cache):
    monkeypatch.setattr(
        lsc, "generate_extraction_selector", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call AI"))
    )
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    assert resolver({"name": "", "type": "llm", "description": "x"}, "<html></html>") is None
    assert resolver({"name": "x", "type": "llm", "description": ""}, "<html></html>") is None


def test_resolver_falls_back_to_default_cap_on_malformed_max_repair_attempts(monkeypatch, fake_cache):
    key = lsc.build_selector_cache_key(domain="example.com", field_name="x", description="x field")
    fake_cache.store[key] = json.dumps({"type": "css", "selector": ".nope", "repair_count": 1})
    monkeypatch.setattr(
        lsc, "generate_extraction_selector", lambda *a, **k: (_ for _ in ()).throw(AssertionError("cap already exhausted"))
    )
    resolver = lsc.make_llm_resolver(domain="example.com", crawl_run_id=None, llm_cfg={"llm_enabled": "true", "llm_provider": "openai"})
    # max_repair_attempts="bad" is malformed -> falls back to DEFAULT_MAX_REPAIR_ATTEMPTS (1),
    # and repair_count (1) already meets that cap, so no AI call should happen.
    spec = {"name": "x", "type": "llm", "description": "x field", "max_repair_attempts": "bad"}
    assert resolver(spec, "<html>no match here</html>") is None
