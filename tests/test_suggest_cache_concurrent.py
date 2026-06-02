"""Thread-safe suggest cache tests."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from website_profiling.db import db_session
from website_profiling.integrations.google.suggest import batch_expand, flush_suggest_cache


@pytest.fixture(scope="module")
def pg_conn():
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set — start Postgres and run alembic upgrade head")
    with db_session() as conn:
        yield conn


def _fake_fetch(task, timeout=8.0):
    seed, source, lang, country = task
    return seed, source, [f"{seed}-{source}-a", f"{seed}-{source}-b"]


def test_batch_expand_flushes_cache_on_main_thread(pg_conn):
    seeds = [f"seed{i}" for i in range(6)]
    with patch(
        "website_profiling.integrations.google.suggest._fetch_one",
        side_effect=_fake_fetch,
    ):
        result = batch_expand(
            seeds,
            sources=("web",),
            max_workers=4,
            cache_conn=pg_conn,
        )
    assert len(result) == 6
    for seed in seeds:
        assert result[seed]["web"]

    cur = pg_conn.execute(
        "SELECT COUNT(*) AS n FROM keyword_suggest_cache WHERE cache_key LIKE 'web:%'"
    )
    row = cur.fetchone()
    assert int(row["n"]) >= 6


def test_flush_suggest_cache_executemany(pg_conn):
    entries = [(f"bulk{i}", "web", [f"kw{i}"]) for i in range(10)]
    flush_suggest_cache(pg_conn, entries)
    cur = pg_conn.execute(
        "SELECT COUNT(*) AS n FROM keyword_suggest_cache WHERE cache_key LIKE 'web:bulk%'"
    )
    assert int(cur.fetchone()["n"]) >= 10
