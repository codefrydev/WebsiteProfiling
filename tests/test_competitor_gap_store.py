"""Tests for competitor keyword gap store."""
from __future__ import annotations

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.integrations.keywords.competitor_gap_store import (
    _migrate_legacy_config_if_empty,
    merge_competitor_keyword_import,
    read_competitor_keyword_gap,
    write_competitor_keyword_gap,
)


def _mock_conn_with_row(data: object | None) -> MagicMock:
    conn = MagicMock()
    if data is None:
        conn.execute.return_value.fetchone.return_value = None
    else:
        conn.execute.return_value.fetchone.return_value = {"data": data}
    return conn


def test_merge_replaces_same_competitor_only() -> None:
    conn = MagicMock()
    existing = [
        {"keyword": "old", "competitor": "rival.com"},
        {"keyword": "other", "competitor": "other.com"},
    ]
    new_rows = [{"keyword": "new-kw", "competitor": "rival.com"}]

    with patch(
        "website_profiling.integrations.keywords.competitor_gap_store.read_competitor_keyword_gap",
        return_value=existing,
    ):
        merged = merge_competitor_keyword_import(conn, 1, "rival.com", new_rows)

    assert len(merged) == 2
    assert merged[0]["keyword"] == "other"
    assert merged[1]["keyword"] == "new-kw"
    conn.execute.assert_called()
    conn.commit.assert_called()


def test_read_returns_empty_when_no_property() -> None:
    conn = MagicMock()
    assert read_competitor_keyword_gap(conn, None) == []


def test_write_calls_upsert() -> None:
    conn = MagicMock()
    write_competitor_keyword_gap(conn, 5, [{"keyword": "x"}])
    conn.execute.assert_called_once()
    conn.commit.assert_called_once()


def test_read_returns_stored_dict_rows() -> None:
    conn = _mock_conn_with_row([{"keyword": "a", "competitor": "x.com"}, "skip"])
    rows = read_competitor_keyword_gap(conn, 3)
    assert rows == [{"keyword": "a", "competitor": "x.com"}]


def test_read_returns_empty_when_data_not_list() -> None:
    conn = _mock_conn_with_row({"not": "a list"})
    assert read_competitor_keyword_gap(conn, 2) == []


def test_read_migrates_when_row_missing() -> None:
    conn = _mock_conn_with_row(None)
    legacy = [{"keyword": "legacy", "competitor": "old.com"}]
    with patch(
        "website_profiling.integrations.keywords.competitor_gap_store._migrate_legacy_config_if_empty",
        return_value=legacy,
    ) as migrate:
        out = read_competitor_keyword_gap(conn, 9)
    migrate.assert_called_once_with(conn, 9)
    assert out == legacy


def test_read_returns_empty_on_db_error() -> None:
    conn = MagicMock()
    conn.execute.side_effect = RuntimeError("db down")
    assert read_competitor_keyword_gap(conn, 1) == []


def test_migrate_legacy_empty_config() -> None:
    conn = MagicMock()
    with patch(
        "website_profiling.db.config_store.read_pipeline_config",
        return_value=({}, []),
    ):
        assert _migrate_legacy_config_if_empty(conn, 1) == []


def test_migrate_legacy_parses_and_writes() -> None:
    conn = MagicMock()
    rows = [{"keyword": "kw", "competitor": "c.com"}]
    raw = json.dumps(rows)
    with patch(
        "website_profiling.db.config_store.read_pipeline_config",
        return_value=({"competitor_keyword_gap_json": raw}, []),
    ):
        out = _migrate_legacy_config_if_empty(conn, 4)
    assert out == rows
    conn.execute.assert_called()
    conn.commit.assert_called()


def test_migrate_legacy_ignores_non_list_json() -> None:
    conn = MagicMock()
    with patch(
        "website_profiling.db.config_store.read_pipeline_config",
        return_value=({"competitor_keyword_gap_json": json.dumps({"bad": True})}, []),
    ):
        assert _migrate_legacy_config_if_empty(conn, 1) == []


def test_migrate_legacy_returns_empty_on_error() -> None:
    conn = MagicMock()
    with patch(
        "website_profiling.db.config_store.read_pipeline_config",
        side_effect=RuntimeError("fail"),
    ):
        assert _migrate_legacy_config_if_empty(conn, 1) == []


def _require_database_url() -> None:
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set")


def _integration_property_id(domain: str) -> int:
    from website_profiling.db import db_session
    from website_profiling.db.property_store import upsert_property_by_domain

    with db_session() as conn:
        return upsert_property_by_domain(conn, "Competitor Gap Test", domain)


def _reset_competitor_gap(conn, property_id: int) -> None:
    """Clear stored rows so legacy pipeline_config cannot leak into merge tests."""
    conn.execute(
        "DELETE FROM competitor_keyword_gap WHERE property_id = %s",
        (property_id,),
    )
    write_competitor_keyword_gap(conn, property_id, [])


@pytest.fixture
def roundtrip_property_id() -> int:
    _require_database_url()
    return _integration_property_id("competitor-gap-roundtrip.example")


@pytest.fixture
def migrate_property_id() -> int:
    _require_database_url()
    return _integration_property_id("competitor-gap-migrate.example")


@pytest.mark.integration
def test_competitor_gap_db_roundtrip(roundtrip_property_id: int) -> None:
    from website_profiling.db import db_session

    with db_session() as conn:
        _reset_competitor_gap(conn, roundtrip_property_id)
        merged = merge_competitor_keyword_import(
            conn,
            roundtrip_property_id,
            "rival.com",
            [{"keyword": "kw1", "competitor": "rival.com"}],
        )
        assert len(merged) == 1

        merged2 = merge_competitor_keyword_import(
            conn,
            roundtrip_property_id,
            "other.com",
            [{"keyword": "kw2", "competitor": "other.com"}],
        )
        assert len(merged2) == 2

        merged3 = merge_competitor_keyword_import(
            conn,
            roundtrip_property_id,
            "rival.com",
            [{"keyword": "new-kw", "competitor": "rival.com"}],
        )
        assert len(merged3) == 2
        assert {r["keyword"] for r in merged3} == {"kw2", "new-kw"}
        assert read_competitor_keyword_gap(conn, roundtrip_property_id) == merged3


@pytest.mark.integration
def test_migrate_legacy_config_from_pipeline(migrate_property_id: int) -> None:
    from website_profiling.db import db_session

    legacy_rows = [{"keyword": "from-config", "competitor": "legacy.com"}]
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
            VALUES (%s, %s, false, now())
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                is_unknown = false,
                updated_at = now()
            """,
            ("competitor_keyword_gap_json", json.dumps(legacy_rows)),
        )
        conn.execute(
            "DELETE FROM competitor_keyword_gap WHERE property_id = %s",
            (migrate_property_id,),
        )
        conn.commit()
        rows = read_competitor_keyword_gap(conn, migrate_property_id)
        assert rows == legacy_rows
        conn.execute(
            "DELETE FROM pipeline_config WHERE key = %s",
            ("competitor_keyword_gap_json",),
        )
        conn.execute(
            "DELETE FROM competitor_keyword_gap WHERE property_id = %s",
            (migrate_property_id,),
        )
        conn.commit()
