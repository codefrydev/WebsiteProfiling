"""Bulk PostgreSQL storage tests."""
from __future__ import annotations

import os

import pandas as pd
import pytest
from psycopg.types.json import Json

from website_profiling.db import db_session, read_crawl, write_crawl
from website_profiling.db.storage import create_crawl_run, write_crawl_batch


@pytest.fixture(scope="module")
def pg_conn():
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set — start Postgres and run alembic upgrade head")
    with db_session() as conn:
        yield conn


def test_write_crawl_bulk_round_trip(pg_conn):
    run_id = create_crawl_run(pg_conn, "https://example.com")
    rows = []
    for i in range(100):
        rows.append(
            (
                run_id,
                f"https://example.com/page-{i}",
                "200",
                f"Page {i}",
                Json({"status": "200", "title": f"Page {i}"}),
            )
        )
    write_crawl_batch(pg_conn, rows, run_id, commit=True)

    df = read_crawl(pg_conn, run_id)
    assert len(df) == 100
    assert "url" in df.columns
    assert df["status"].astype(str).str.startswith("200").all()


def test_write_crawl_dataframe_executemany(pg_conn):
    run_id = create_crawl_run(pg_conn, "https://bulk.example.com")
    data = {
        "url": [f"https://bulk.example.com/{i}" for i in range(50)],
        "status": ["200"] * 50,
        "title": [f"T{i}" for i in range(50)],
    }
    df = pd.DataFrame(data)
    write_crawl(pg_conn, df, crawl_run_id=run_id)
    out = read_crawl(pg_conn, run_id)
    assert len(out) == 50
