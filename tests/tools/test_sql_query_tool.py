"""Unit tests for the read-only SQL chat tool (assert_read_only + handlers)."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.audit_tools.sql_query import (
    ReadOnlyViolation,
    _strip_sql_literals,
    assert_read_only,
    assert_read_only_regex,
    get_sql_schema,
    run_sql_query,
)
from website_profiling.tools.audit_tools.context import AuditToolContext


# ---------------------------------------------------------------------------
# assert_read_only — accepted queries
# ---------------------------------------------------------------------------

class TestAssertReadOnlyAccepted:
    def test_simple_select(self) -> None:
        assert_read_only("SELECT * FROM crawl_results LIMIT 10")

    def test_select_with_where(self) -> None:
        assert_read_only("SELECT url, data FROM crawl_results WHERE crawl_run_id = 1")

    def test_aggregate(self) -> None:
        assert_read_only(
            "SELECT status, COUNT(*) FROM crawl_results GROUP BY status ORDER BY 2 DESC"
        )

    def test_join(self) -> None:
        assert_read_only(
            "SELECT r.url, a.score FROM lighthouse_runs r "
            "JOIN lh_audits a ON a.run_id = r.id LIMIT 20"
        )

    def test_cte(self) -> None:
        assert_read_only(
            "WITH top AS (SELECT url, count FROM nodes ORDER BY count DESC LIMIT 10) "
            "SELECT * FROM top"
        )

    def test_union(self) -> None:
        assert_read_only(
            "SELECT url FROM crawl_results LIMIT 5 "
            "UNION ALL "
            "SELECT from_url AS url FROM edges LIMIT 5"
        )

    def test_subquery(self) -> None:
        assert_read_only(
            "SELECT * FROM (SELECT url, data FROM crawl_results LIMIT 5) sub"
        )

    def test_information_schema(self) -> None:
        assert_read_only(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        )


# ---------------------------------------------------------------------------
# Layer 0 — regex pre-filter (_strip_sql_literals + assert_read_only_regex)
# ---------------------------------------------------------------------------

class TestStripSqlLiterals:
    def test_strips_line_comment(self) -> None:
        result = _strip_sql_literals("SELECT 1 -- DROP TABLE foo")
        assert "DROP" not in result

    def test_strips_block_comment(self) -> None:
        result = _strip_sql_literals("SELECT /* DELETE FROM x */ 1")
        assert "DELETE" not in result

    def test_strips_string_literal_content(self) -> None:
        result = _strip_sql_literals("SELECT * FROM t WHERE name = 'delete me'")
        assert "delete me" not in result
        assert "name" in result

    def test_strips_dollar_quote(self) -> None:
        result = _strip_sql_literals("SELECT $$DELETE FROM foo$$")
        assert "DELETE" not in result

    def test_preserves_table_name_outside_literal(self) -> None:
        result = _strip_sql_literals("SELECT * FROM crawl_results")
        assert "crawl_results" in result


class TestAssertReadOnlyRegex:
    """Layer 0 in isolation — tests that don't depend on sqlglot."""

    def test_accepts_plain_select(self) -> None:
        assert_read_only_regex("SELECT * FROM crawl_results LIMIT 10")

    def test_rejects_delete(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)delete"):
            assert_read_only_regex("DELETE FROM crawl_results")

    def test_rejects_update(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)update"):
            assert_read_only_regex("UPDATE crawl_results SET data = '{}'")

    def test_rejects_insert(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)insert"):
            assert_read_only_regex("INSERT INTO crawl_results VALUES (1, '{}')")

    def test_rejects_drop(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)drop"):
            assert_read_only_regex("DROP TABLE crawl_results")

    def test_rejects_truncate(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)truncate"):
            assert_read_only_regex("TRUNCATE crawl_results")

    def test_rejects_denied_table(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="llm_config"):
            assert_read_only_regex("SELECT * FROM llm_config")

    def test_rejects_delete_hidden_in_block_comment_after_stripping(self) -> None:
        # Block comment content is stripped, so DELETE inside it is invisible.
        # This means the query passes Layer 0 — which is correct because the
        # comment text is inert SQL.  sqlglot (Layer 1) will also accept it.
        assert_read_only_regex("SELECT 1 /* this was DELETE FROM x */")

    def test_rejects_keyword_in_string_literal_does_not_trigger(self) -> None:
        # A write keyword inside a string value is stripped before scanning.
        assert_read_only_regex("SELECT * FROM crawl_results WHERE url = 'http://ex.com/delete'")

    def test_rejects_begin(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)begin"):
            assert_read_only_regex("BEGIN; SELECT 1")

    def test_rejects_set(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)set"):
            assert_read_only_regex("SET search_path = evil")

    def test_rejects_grant(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)grant"):
            assert_read_only_regex("GRANT SELECT ON ALL TABLES TO attacker")

    def test_rejects_pg_sleep(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="pg_sleep"):
            assert_read_only_regex("SELECT pg_sleep(9999)")

    def test_rejects_dblink(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="(?i)dblink"):
            assert_read_only_regex("SELECT dblink('host=evil', 'SELECT 1')")

    def test_does_not_flag_updates_as_word_in_column_alias(self) -> None:
        # 'updates' contains 'update' but is a different word; word boundaries protect this.
        assert_read_only_regex("SELECT count(*) AS total_updates FROM crawl_results")

    def test_does_not_flag_deleted_as_column_name(self) -> None:
        assert_read_only_regex("SELECT deleted_at FROM crawl_results")

    def test_does_not_flag_created_as_column_name(self) -> None:
        assert_read_only_regex("SELECT created_at FROM crawl_runs")

    def test_rejects_nested_denied_table_in_cte(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only_regex(
                "WITH s AS (SELECT * FROM pipeline_config) SELECT * FROM s"
            )


# ---------------------------------------------------------------------------
# assert_read_only — rejected: write / DDL
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedWrites:
    def test_delete(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("DELETE FROM crawl_results WHERE id = 1")

    def test_update(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("UPDATE crawl_results SET data = '{}' WHERE id = 1")

    def test_insert(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("INSERT INTO crawl_results (url, data) VALUES ('x', '{}')")

    def test_drop_table(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("DROP TABLE crawl_results")

    def test_alter_table(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("ALTER TABLE crawl_results ADD COLUMN foo TEXT")

    def test_truncate(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("TRUNCATE TABLE crawl_results")

    def test_create_table(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("CREATE TABLE evil (id INT)")

    def test_merge(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only(
                "MERGE INTO crawl_results USING (SELECT 1 AS id) s "
                "ON crawl_results.id = s.id WHEN MATCHED THEN DELETE"
            )


# ---------------------------------------------------------------------------
# assert_read_only — rejected: multi-statement
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedMultiStatement:
    def test_select_then_drop(self) -> None:
        # Layer 0 now catches DROP before Layer 1 counts statements — still a violation
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT 1; DROP TABLE crawl_results")

    def test_select_then_delete(self) -> None:
        # Layer 0 now catches DELETE before Layer 1 counts statements — still a violation
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM crawl_results; DELETE FROM crawl_results")

    def test_two_selects(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="single"):
            assert_read_only("SELECT 1; SELECT 2")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: denied tables
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedDeniedTables:
    def test_llm_config(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="llm_config"):
            assert_read_only("SELECT * FROM llm_config")

    def test_google_app_settings(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="google_app_settings"):
            assert_read_only("SELECT * FROM google_app_settings")

    def test_pipeline_config(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="pipeline_config"):
            assert_read_only("SELECT * FROM pipeline_config")

    def test_chat_sessions(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="chat_sessions"):
            assert_read_only("SELECT * FROM chat_sessions")

    def test_chat_messages(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="chat_messages"):
            assert_read_only("SELECT * FROM chat_messages")

    def test_content_drafts(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="content_drafts"):
            assert_read_only("SELECT * FROM content_drafts")

    def test_denied_table_in_cte(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only(
                "WITH s AS (SELECT * FROM llm_config) SELECT * FROM s"
            )

    def test_denied_table_in_subquery(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only(
                "SELECT * FROM (SELECT * FROM pipeline_config) sub"
            )


# ---------------------------------------------------------------------------
# assert_read_only — rejected: dangerous functions
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedFunctions:
    def test_pg_sleep(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_sleep(9999)")

    def test_pg_read_file(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_read_file('/etc/passwd')")

    # --- advisory locks (not blocked by READ ONLY txn, so must be caught here) ---

    def test_pg_advisory_lock(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_advisory_lock(42)")

    def test_pg_advisory_xact_lock(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_advisory_xact_lock(42)")

    def test_pg_advisory_lock_shared(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_advisory_lock_shared(42)")

    def test_pg_try_advisory_lock(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_try_advisory_lock(42)")

    # --- other side-effecting callables ---

    def test_pg_notify(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_notify('events', 'payload')")

    def test_nextval(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT nextval('some_sequence')")

    def test_setval(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT setval('some_sequence', 1)")

    # --- SELECT INTO (creates a new table) ---

    def test_select_into_creates_table(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * INTO new_table FROM crawl_results")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: empty / invalid SQL
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedMisc:
    def test_empty_string(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="empty"):
            assert_read_only("")

    def test_whitespace_only(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="empty"):
            assert_read_only("   ")

    def test_non_select_statement_without_write(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("EXPLAIN SELECT 1")  # not a pure SELECT top node


# ---------------------------------------------------------------------------
# run_sql_query handler
# ---------------------------------------------------------------------------

def _make_ro_rows(columns: list[str], rows: list[list[Any]]):
    """Build dict-rows as psycopg dict_row returns them."""
    return [dict(zip(columns, r)) for r in rows]


def _ro_session_patch(columns: list[str], rows: list[list[Any]]):
    """Context-manager patch that fakes readonly_session() and its cursor."""
    dict_rows = _make_ro_rows(columns, rows)

    class _FakeCursor:
        description = [(c,) for c in columns]

        def execute(self, sql: str) -> None:
            self._last_sql = sql

        def fetchall(self):
            return dict_rows

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    class _FakeConn:
        def cursor(self):
            return _FakeCursor()

        def rollback(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    @contextmanager
    def _fake_ro_session() -> Iterator[_FakeConn]:
        yield _FakeConn()

    return patch(
        "website_profiling.tools.audit_tools.sql_query.readonly_session",
        _fake_ro_session,
    )


class TestRunSqlQuery:
    def _ctx(self) -> AuditToolContext:
        return AuditToolContext()

    def _conn(self):
        return MagicMock()

    def test_returns_columns_and_rows(self) -> None:
        columns = ["url", "count"]
        data = [["https://ex.com/", 42], ["https://ex.com/about", 7]]
        with _ro_session_patch(columns, data):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT url, count FROM nodes LIMIT 10"},
            )
        assert result["columns"] == columns
        assert len(result["rows"]) == 2
        assert result["rows"][0]["url"] == "https://ex.com/"
        assert result["row_count"] == 2
        assert result["truncated"] is False

    def test_missing_sql_returns_error(self) -> None:
        result = run_sql_query(self._conn(), self._ctx(), {})
        assert "error" in result

    def test_write_rejected_before_db(self) -> None:
        called = []

        @contextmanager
        def _never_called() -> Iterator[None]:
            called.append(True)
            yield None

        with patch(
            "website_profiling.tools.audit_tools.sql_query.readonly_session",
            _never_called,
        ):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "DELETE FROM crawl_results"},
            )
        assert "error" in result
        assert "Query rejected" in result["error"]
        assert not called, "readonly_session must not be called when SQL is rejected"

    def test_denied_table_rejected_before_db(self) -> None:
        called = []

        @contextmanager
        def _never_called() -> Iterator[None]:
            called.append(True)
            yield None

        with patch(
            "website_profiling.tools.audit_tools.sql_query.readonly_session",
            _never_called,
        ):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT * FROM llm_config"},
            )
        assert "error" in result
        assert not called

    def test_row_cap_respected(self) -> None:
        columns = ["id"]
        data = [[i] for i in range(10)]
        with _ro_session_patch(columns, data):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT id FROM crawl_runs", "row_cap": 10},
            )
        assert result["row_count"] == 10

    def test_truncated_flag_set(self) -> None:
        columns = ["id"]
        data = [[i] for i in range(5)]
        with _ro_session_patch(columns, data):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT id FROM crawl_runs", "row_cap": 5},
            )
        assert result["truncated"] is True


# ---------------------------------------------------------------------------
# get_sql_schema handler
# ---------------------------------------------------------------------------

class TestGetSqlSchema:
    def _ctx(self) -> AuditToolContext:
        return AuditToolContext()

    def _conn(self):
        return MagicMock()

    def test_returns_tables_list(self) -> None:
        schema_rows = [
            {"table_name": "crawl_runs", "column_name": "id", "data_type": "bigint", "is_nullable": "NO"},
            {"table_name": "crawl_runs", "column_name": "start_url", "data_type": "text", "is_nullable": "YES"},
            {"table_name": "llm_config", "column_name": "provider", "data_type": "text", "is_nullable": "YES"},
        ]

        class _FakeCursor:
            description = [("table_name",), ("column_name",), ("data_type",), ("is_nullable",)]

            def execute(self, sql: str) -> None:
                pass

            def fetchall(self):
                return schema_rows

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        class _FakeConn:
            def cursor(self):
                return _FakeCursor()

            def rollback(self):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        @contextmanager
        def _fake_ro() -> Iterator:
            yield _FakeConn()

        with patch(
            "website_profiling.tools.audit_tools.sql_query.readonly_session",
            _fake_ro,
        ):
            result = get_sql_schema(self._conn(), self._ctx(), {})

        table_names = [t["table"] for t in result["tables"]]
        assert "crawl_runs" in table_names
        # denied table must be excluded
        assert "llm_config" not in table_names
        assert result["denied_tables_excluded"] is True
