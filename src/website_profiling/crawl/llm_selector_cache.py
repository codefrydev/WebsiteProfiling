"""Bootstrap-once, cache, replay: LLM-generated selectors for 'llm'-type
custom extractors. Pays an LLM cost at most twice per (site, field) for the
lifetime of the cache entry — once to bootstrap, once to repair if the
selector ever stops matching — never once per page."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from bs4 import BeautifulSoup

from ..ai_service_client import generate_extraction_selector
from ..db import db_session, read_llm_cache, read_page_html_for_run, write_llm_cache
from ..llm_config import llm_is_enabled
from .extraction import LlmResolver, _execute_selector

CACHE_NAMESPACE = "custom_extractor_selector"
SCHEMA_VERSION = "v1"
DEFAULT_MAX_REPAIR_ATTEMPTS = 1  # 1 bootstrap + this many repairs, ever, per (domain, field)
MAX_BOOTSTRAP_SAMPLES = 3


def build_selector_cache_key(*, domain: str, field_name: str, description: str) -> str:
    payload = {
        "domain": domain.strip().lower(),
        "field_name": field_name.strip(),
        "description": description.strip(),
    }
    raw = f"{CACHE_NAMESPACE}:{SCHEMA_VERSION}:{json.dumps(payload, sort_keys=True)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _selector_matches(spec: dict[str, Any], html: str) -> bool:
    try:
        soup = BeautifulSoup(html, "lxml")
        return bool(_execute_selector(spec, soup, html))
    except Exception:
        return False


def _load_bootstrap_html_samples(crawl_run_id: Optional[int], current_html: str) -> list[str]:
    """Ground the bootstrap call in real pages from this crawl if any have
    been captured already; otherwise fall back to just the current page."""
    if crawl_run_id is not None:
        try:
            with db_session() as conn:
                rows = list(
                    read_page_html_for_run(conn, crawl_run_id, limit=MAX_BOOTSTRAP_SAMPLES)
                )
            samples = [str(r["html"]) for r in rows if r.get("html")]
            if samples:
                return samples[:MAX_BOOTSTRAP_SAMPLES]
        except Exception:
            pass
    return [current_html]


def _read_cached_spec(key: str) -> Optional[dict[str, Any]]:
    try:
        with db_session() as conn:
            raw = read_llm_cache(conn, key)
    except Exception:
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


def _write_cached_spec(key: str, spec: dict[str, Any]) -> None:
    try:
        with db_session() as conn:
            write_llm_cache(conn, key, json.dumps(spec))
    except Exception:
        pass


def _generate_and_cache(
    *,
    key: str,
    field_name: str,
    description: str,
    html_samples: list[str],
    previous_selector: Optional[dict[str, Any]],
    previous_selector_failed: bool,
    repair_count: int,
) -> Optional[dict[str, Any]]:
    result = generate_extraction_selector(
        field_name,
        description,
        html_samples,
        previous_selector=previous_selector,
        previous_selector_failed=previous_selector_failed,
    )
    if not result.get("ok"):
        return None
    selector_type = str(result.get("type") or "").strip().lower()
    selector = str(result.get("selector") or "").strip()
    if selector_type not in ("css", "xpath") or not selector:
        return None
    spec = {
        "type": selector_type,
        "selector": selector,
        "attr": str(result.get("attr") or ""),
        "confidence": result.get("confidence"),
        "rationale": str(result.get("rationale") or ""),
        "repair_count": repair_count,
    }
    _write_cached_spec(key, spec)
    return spec


def make_llm_resolver(
    *, domain: str, crawl_run_id: Optional[int], llm_cfg: dict[str, str]
) -> Optional[LlmResolver]:
    """Build a resolver for run_extractors(llm_resolver=...), scoped to this
    crawl's domain/run. Returns None when LLM is disabled — callers should
    skip attaching a resolver entirely in that case (and warn once)."""
    if not llm_is_enabled(llm_cfg):
        return None

    def _resolve(spec: dict[str, Any], html: str) -> Optional[dict[str, Any]]:
        name = str(spec.get("name") or "").strip()
        description = str(spec.get("description") or "").strip()
        if not name or not description:
            return None
        try:
            cap = int(spec.get("max_repair_attempts", DEFAULT_MAX_REPAIR_ATTEMPTS))
        except (TypeError, ValueError):
            cap = DEFAULT_MAX_REPAIR_ATTEMPTS

        key = build_selector_cache_key(domain=domain, field_name=name, description=description)
        cached = _read_cached_spec(key)

        if cached:
            if _selector_matches(cached, html):
                return cached
            # Cached selector didn't match this page: could be a genuinely
            # absent field on this page, or a broken selector. Either way,
            # try at most one repair, grounded on the actual failing page.
            if int(cached.get("repair_count", 0)) >= cap:
                return None
            repaired = _generate_and_cache(
                key=key,
                field_name=name,
                description=description,
                html_samples=[html],
                previous_selector=cached,
                previous_selector_failed=True,
                repair_count=int(cached.get("repair_count", 0)) + 1,
            )
            return repaired if repaired and _selector_matches(repaired, html) else None

        # First time this (domain, field) pair is seen: bootstrap.
        samples = _load_bootstrap_html_samples(crawl_run_id, html)
        bootstrapped = _generate_and_cache(
            key=key,
            field_name=name,
            description=description,
            html_samples=samples,
            previous_selector=None,
            previous_selector_failed=False,
            repair_count=0,
        )
        return bootstrapped if bootstrapped and _selector_matches(bootstrapped, html) else None

    return _resolve
