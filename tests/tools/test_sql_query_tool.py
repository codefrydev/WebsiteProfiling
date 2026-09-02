"""Unit tests for the read-only SQL chat tool (assert_read_only + handlers)."""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.audit_tools.core.sql_query import (
    ReadOnlyViolation,
    _ALLOWED_TABLES,
    _MAX_SQL_BYTES,
    _inject_scope_ctes,
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

    def test_rejects_secret_table(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="llm_settings"):
            assert_read_only_regex("SELECT * FROM llm_settings")

    def test_comment_content_is_inert(self) -> None:
        # Block comment content is stripped; DELETE inside it is invisible.
        # This is correct — comment text is inert SQL.
        assert_read_only_regex("SELECT 1 /* this was DELETE FROM x */")

    def test_keyword_in_string_literal_does_not_trigger(self) -> None:
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
        assert_read_only_regex("SELECT count(*) AS total_updates FROM crawl_results")

    def test_does_not_flag_deleted_as_column_name(self) -> None:
        assert_read_only_regex("SELECT deleted_at FROM crawl_results")

    def test_does_not_flag_created_as_column_name(self) -> None:
        assert_read_only_regex("SELECT created_at FROM crawl_runs")

    def test_rejects_nested_secret_table_in_cte(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only_regex(
                "WITH s AS (SELECT * FROM llm_settings) SELECT * FROM s"
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

    def test_select_for_update(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM crawl_results FOR UPDATE")

    def test_select_for_share(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM crawl_results FOR SHARE")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: multi-statement
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedMultiStatement:
    def test_select_then_drop(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT 1; DROP TABLE crawl_results")

    def test_select_then_delete(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM crawl_results; DELETE FROM crawl_results")

    def test_two_selects(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="single"):
            assert_read_only("SELECT 1; SELECT 2")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: secret tables (Layer 0 + Layer 1)
# ---------------------------------------------------------------------------

class TestAssertReadOnlyRejectedSecretTables:
    def test_llm_config(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM llm_settings")

    def test_google_app_settings(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM google_app_settings")

    def test_pipeline_config(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM pipeline_config")

    def test_chat_sessions(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM chat_sessions")

    def test_chat_messages(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM chat_messages")

    def test_content_drafts(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM content_drafts")

    def test_properties_rejected(self) -> None:
        # properties holds google_refresh_token / OAuth creds — must not be
        # reachable from the chat SQL tool.
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT google_refresh_token FROM properties")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: table allowlist (non-secret unlisted tables)
# ---------------------------------------------------------------------------

class TestAssertReadOnlyAllowlist:
    def test_rejects_unlisted_table(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="not in the list"):
            assert_read_only("SELECT * FROM pipeline_jobs")

    def test_rejects_export_jobs(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="not in the list"):
            assert_read_only("SELECT * FROM export_jobs")

    def test_rejects_audit_log(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="not in the list"):
            assert_read_only("SELECT * FROM audit_log")

    def test_all_allowed_tables_pass(self) -> None:
        for tbl in sorted(_ALLOWED_TABLES):
            assert_read_only(f"SELECT * FROM {tbl} LIMIT 1")

    def test_secret_table_in_cte_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only(
                "WITH s AS (SELECT * FROM llm_settings) SELECT * FROM s"
            )

    def test_unlisted_table_in_subquery_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="not in the list"):
            assert_read_only("SELECT * FROM (SELECT * FROM pipeline_jobs) sub")


# ---------------------------------------------------------------------------
# assert_read_only — rejected: information_schema / pg_catalog (metadata leak)
# ---------------------------------------------------------------------------

class TestAssertReadOnlyBlockedSchemas:
    def test_information_schema_tables_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="information_schema"):
            assert_read_only(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )

    def test_information_schema_columns_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="information_schema"):
            assert_read_only(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'llm_settings'"
            )

    def test_pg_catalog_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="pg_catalog"):
            assert_read_only("SELECT * FROM pg_catalog.pg_tables")

    def test_schema_qualified_secret_table_rejected(self) -> None:
        # public.llm_settings — still rejects via allowlist check
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * FROM public.llm_settings")

    def test_schema_qualified_allowed_table_rejected(self) -> None:
        # public.<allowed> resolves to the real base table and would bypass the
        # injected tenant-scope CTE — must be rejected even though google_data
        # is allowlisted unqualified.
        with pytest.raises(ReadOnlyViolation, match="Schema-qualified"):
            assert_read_only("SELECT * FROM public.google_data")

    def test_catalog_qualified_table_rejected(self) -> None:
        with pytest.raises(ReadOnlyViolation, match="Schema-qualified"):
            assert_read_only("SELECT * FROM cat.public.crawl_results")


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

    def test_pg_notify(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT pg_notify('events', 'payload')")

    def test_nextval(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT nextval('some_sequence')")

    def test_setval(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT setval('some_sequence', 1)")

    def test_select_into_creates_table(self) -> None:
        with pytest.raises(ReadOnlyViolation):
            assert_read_only("SELECT * INTO new_table FROM crawl_results")


# ---------------------------------------------------------------------------
# assert_read_only — size cap
# ---------------------------------------------------------------------------

class TestAssertReadOnlySizeCap:
    def test_oversized_sql_rejected(self) -> None:
        big_sql = "SELECT * FROM crawl_results WHERE url = '" + "x" * (_MAX_SQL_BYTES + 100) + "'"
        with pytest.raises(ReadOnlyViolation, match="size limit"):
            assert_read_only(big_sql)

    def test_sql_at_limit_accepted(self) -> None:
        # A valid SELECT well within the limit
        assert_read_only("SELECT * FROM crawl_results LIMIT 10")


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
            assert_read_only("EXPLAIN SELECT 1")


# ---------------------------------------------------------------------------
# _inject_scope_ctes
# ---------------------------------------------------------------------------

class TestInjectScopeCtes:
    def _stmt(self, sql: str):
        import sqlglot
        stmts = sqlglot.parse(sql, read="postgres")
        return stmts[0]

    def test_no_injection_for_unscoped_tables(self) -> None:
        sql = "SELECT * FROM lighthouse_runs LIMIT 5"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=7)
        assert result == sql

    def test_injects_crawl_runs_scope(self) -> None:
        sql = "SELECT * FROM crawl_runs LIMIT 5"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=7)
        assert "WHERE property_id = 7" in result
        assert "crawl_runs AS" in result

    def test_injects_crawl_results_via_crawl_runs(self) -> None:
        sql = "SELECT url FROM crawl_results LIMIT 10"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=3)
        assert "WHERE property_id = 3" in result
        assert "crawl_run_id IN" in result

    def test_injects_property_scoped_table(self) -> None:
        sql = "SELECT * FROM google_data LIMIT 5"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=5)
        assert "WHERE property_id = 5" in result
        assert "google_data AS" in result

    def test_merges_with_existing_with_clause(self) -> None:
        sql = "WITH top AS (SELECT id FROM crawl_runs LIMIT 5) SELECT * FROM top"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=9)
        # Our CTE must come before the user's CTE
        assert result.upper().index("CRAWL_RUNS AS") < result.upper().index("TOP AS")

    def test_conflict_raises(self) -> None:
        sql = "WITH crawl_runs AS (SELECT 1) SELECT * FROM crawl_runs"
        with pytest.raises(ReadOnlyViolation, match="conflict"):
            _inject_scope_ctes(sql, self._stmt(sql), property_id=1)

    def test_recursive_query_is_subquery_wrapped(self) -> None:
        # Scope CTEs self-shadow their base tables, which is invalid under
        # WITH RECURSIVE; the query must instead be wrapped in a subquery so the
        # outer scope CTEs apply without breaking the recursive form.
        sql = "WITH RECURSIVE sub AS (SELECT crawl_run_id FROM crawl_results) SELECT * FROM sub"
        result = _inject_scope_ctes(sql, self._stmt(sql), property_id=3)
        assert "WHERE property_id = 3" in result
        assert "_scoped" in result
        assert "WITH RECURSIVE sub" in result
        # The injected CTEs must NOT be spliced in front of RECURSIVE.
        assert ",\nRECURSIVE" not in result


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
        "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
        _fake_ro_session,
    )


class TestRunSqlQuery:
    def _ctx(self, property_id: int | None = None) -> AuditToolContext:
        return AuditToolContext(property_id=property_id)

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
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
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

    def test_secret_table_rejected_before_db(self) -> None:
        called = []

        @contextmanager
        def _never_called() -> Iterator[None]:
            called.append(True)
            yield None

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _never_called,
        ):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT * FROM llm_settings"},
            )
        assert "error" in result
        assert not called

    def test_unlisted_table_rejected_before_db(self) -> None:
        called = []

        @contextmanager
        def _never_called() -> Iterator[None]:
            called.append(True)
            yield None

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _never_called,
        ):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT * FROM pipeline_jobs"},
            )
        assert "error" in result
        assert not called

    def test_oversized_sql_rejected(self) -> None:
        big_sql = "SELECT * FROM crawl_results WHERE url = '" + "x" * (_MAX_SQL_BYTES + 100) + "'"
        result = run_sql_query(self._conn(), self._ctx(), {"sql": big_sql})
        assert "error" in result
        assert "Query rejected" in result["error"]

    def test_db_error_returns_generic_message(self) -> None:
        class _BrokenConn:
            def cursor(self):
                raise RuntimeError("relation does not exist: secret_table")

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

            def rollback(self):
                pass

        @contextmanager
        def _broken_session():
            yield _BrokenConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _broken_session,
        ):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT * FROM crawl_results LIMIT 1"},
            )
        assert "error" in result
        # Must NOT leak raw error with internal table/relation names
        assert "secret_table" not in result["error"]
        assert "relation does not exist" not in result["error"]

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

    def test_truncated_flag_accurate_when_equal_to_cap(self) -> None:
        # row_cap=5 but only 5 rows exist → NOT truncated (exact match is not truncation).
        # The handler fetches row_cap+1=6 rows; if fewer than 6 come back, not truncated.
        columns = ["id"]
        data = [[i] for i in range(5)]  # exactly 5 rows
        with _ro_session_patch(columns, data):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT id FROM crawl_runs", "row_cap": 5},
            )
        assert result["row_count"] == 5
        assert result["truncated"] is False

    def test_truncated_flag_set_when_more_rows_exist(self) -> None:
        # row_cap=5 but DB returns 6 rows (row_cap+1 was requested) → truncated.
        columns = ["id"]
        data = [[i] for i in range(6)]  # one more than cap
        with _ro_session_patch(columns, data):
            result = run_sql_query(
                self._conn(),
                self._ctx(),
                {"sql": "SELECT id FROM crawl_runs", "row_cap": 5},
            )
        assert result["row_count"] == 5  # capped at 5
        assert result["truncated"] is True

    def test_scope_ctes_injected_when_property_set(self) -> None:
        """Verify scope injection runs when ctx.property_id is set."""
        executed_sqls: list[str] = []

        class _TrackingCursor:
            description = [("url",)]

            def execute(self, sql: str) -> None:
                executed_sqls.append(sql)

            def fetchall(self):
                return []

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        class _FakeConn:
            def cursor(self):
                return _TrackingCursor()

            def rollback(self):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        @contextmanager
        def _fake_ro():
            yield _FakeConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _fake_ro,
        ):
            run_sql_query(
                self._conn(),
                self._ctx(property_id=42),
                {"sql": "SELECT url FROM crawl_results LIMIT 5"},
            )

        assert executed_sqls, "cursor.execute was not called"
        executed = executed_sqls[0]
        assert "property_id = 42" in executed
        assert "crawl_run_id IN" in executed

    def test_no_scope_injection_without_property(self) -> None:
        """Without a property_id, no scope CTEs should be injected."""
        executed_sqls: list[str] = []

        class _TrackingCursor:
            description = [("url",)]

            def execute(self, sql: str) -> None:
                executed_sqls.append(sql)

            def fetchall(self):
                return []

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        class _FakeConn:
            def cursor(self):
                return _TrackingCursor()

            def rollback(self):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        @contextmanager
        def _fake_ro():
            yield _FakeConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _fake_ro,
        ):
            run_sql_query(
                self._conn(),
                self._ctx(property_id=None),
                {"sql": "SELECT url FROM crawl_results LIMIT 5"},
            )

        assert executed_sqls
        assert "property_id" not in executed_sqls[0]


# ---------------------------------------------------------------------------
# get_sql_schema handler
# ---------------------------------------------------------------------------

class TestGetSqlSchema:
    def _ctx(self) -> AuditToolContext:
        return AuditToolContext()

    def _conn(self):
        return MagicMock()

    def test_returns_allowlisted_tables_only(self) -> None:
        col_rows = [
            {"table_name": "crawl_runs", "column_name": "id", "data_type": "bigint",
             "is_nullable": "NO", "constraint_type": "PRIMARY KEY"},
            {"table_name": "crawl_runs", "column_name": "start_url", "data_type": "text",
             "is_nullable": "YES", "constraint_type": None},
            # secret table — must be excluded
            {"table_name": "llm_settings", "column_name": "provider", "data_type": "text",
             "is_nullable": "NO", "constraint_type": "PRIMARY KEY"},
            # non-allowlisted table — must be excluded
            {"table_name": "pipeline_jobs", "column_name": "id", "data_type": "uuid",
             "is_nullable": "NO", "constraint_type": "PRIMARY KEY"},
        ]
        fk_rows: list[dict] = []

        class _FakeCursor:
            description = [("table_name",), ("column_name",), ("data_type",),
                           ("is_nullable",), ("constraint_type",)]
            _call_count = 0

            def execute(self, sql: str) -> None:
                pass

            def fetchall(self):
                _FakeCursor._call_count += 1
                if _FakeCursor._call_count == 1:
                    return col_rows
                return fk_rows

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
        def _fake_ro():
            _FakeCursor._call_count = 0
            yield _FakeConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _fake_ro,
        ):
            result = get_sql_schema(self._conn(), self._ctx(), {})

        table_names = [t["table"] for t in result["tables"]]
        assert "crawl_runs" in table_names
        assert "llm_settings" not in table_names
        assert "pipeline_jobs" not in table_names
        assert result["allowlisted_tables_only"] is True

    def test_includes_primary_key_info(self) -> None:
        col_rows = [
            {"table_name": "crawl_runs", "column_name": "id", "data_type": "bigint",
             "is_nullable": "NO", "constraint_type": "PRIMARY KEY"},
        ]

        class _FakeCursor:
            _call_count = 0
            description = [("table_name",), ("column_name",), ("data_type",),
                           ("is_nullable",), ("constraint_type",)]

            def execute(self, sql: str) -> None:
                pass

            def fetchall(self):
                _FakeCursor._call_count += 1
                return col_rows if _FakeCursor._call_count == 1 else []

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
        def _fake_ro():
            _FakeCursor._call_count = 0
            yield _FakeConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _fake_ro,
        ):
            result = get_sql_schema(self._conn(), self._ctx(), {})

        crawl_runs = next(t for t in result["tables"] if t["table"] == "crawl_runs")
        id_col = next(c for c in crawl_runs["columns"] if c["column"] == "id")
        assert id_col["primary_key"] is True

    def test_db_error_returns_generic_message(self) -> None:
        class _BrokenConn:
            def cursor(self):
                raise RuntimeError("pg connection refused")

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

            def rollback(self):
                pass

        @contextmanager
        def _broken_session():
            yield _BrokenConn()

        with patch(
            "website_profiling.tools.audit_tools.core.sql_query.readonly_session",
            _broken_session,
        ):
            result = get_sql_schema(self._conn(), self._ctx(), {})

        assert "error" in result
        assert "pg connection refused" not in result["error"]
        assert "refused" not in result["error"]


# ---------------------------------------------------------------------------
# Feature-flag gating
# ---------------------------------------------------------------------------

class TestFeatureFlagGating:
    def test_chat_sql_tool_enabled_false_by_default(self) -> None:
        from website_profiling.tools.audit_tools.tool_selector import chat_sql_tool_enabled
        env_backup = os.environ.pop("CHAT_SQL_TOOL_ENABLED", None)
        try:
            assert not chat_sql_tool_enabled()
        finally:
            if env_backup is not None:
                os.environ["CHAT_SQL_TOOL_ENABLED"] = env_backup

    def test_chat_sql_tool_enabled_true(self) -> None:
        from website_profiling.tools.audit_tools.tool_selector import chat_sql_tool_enabled
        with patch.dict(os.environ, {"CHAT_SQL_TOOL_ENABLED": "true"}):
            assert chat_sql_tool_enabled()

    def test_chat_sql_tool_enabled_accepts_1_and_yes(self) -> None:
        from website_profiling.tools.audit_tools.tool_selector import chat_sql_tool_enabled
        for val in ("1", "yes", "YES", "True"):
            with patch.dict(os.environ, {"CHAT_SQL_TOOL_ENABLED": val}):
                assert chat_sql_tool_enabled(), f"Expected True for CHAT_SQL_TOOL_ENABLED={val}"

    def test_sql_tools_included_in_selection_when_enabled(self) -> None:
        from website_profiling.tools.audit_tools.tool_selector import select_tools_for_turn
        with patch.dict(os.environ, {"CHAT_SQL_TOOL_ENABLED": "true"}):
            selected = select_tools_for_turn("show me some data")
        assert "get_sql_schema" in selected
        assert "run_sql_query" in selected

    def test_sql_tools_excluded_when_disabled(self) -> None:
        from website_profiling.tools.audit_tools.tool_selector import select_tools_for_turn
        with patch.dict(os.environ, {"CHAT_SQL_TOOL_ENABLED": "false"}):
            selected = select_tools_for_turn("show me some data")
        assert "get_sql_schema" not in selected
        assert "run_sql_query" not in selected

    def test_sql_tools_dispatch_disabled(self) -> None:
        from website_profiling.tools.audit_tools.registry import dispatch_tool

        with patch.dict(os.environ, {"CHAT_SQL_TOOL_ENABLED": "false"}):
            res = dispatch_tool("run_sql_query", {"query": "SELECT 1"})
            assert res == {"error": "tool disabled: run_sql_query"}
            res2 = dispatch_tool("get_sql_schema", {})
            assert res2 == {"error": "tool disabled: get_sql_schema"}


# ---------------------------------------------------------------------------
# Remaining branch coverage
# ---------------------------------------------------------------------------

class TestSqlQueryRemainingBranches:
    def test_anonymous_forbidden_function_with_regex_bypass(self) -> None:
        with patch("website_profiling.tools.audit_tools.core.sql_query.assert_read_only_regex"):
            with pytest.raises(ReadOnlyViolation, match="not permitted"):
                assert_read_only("SELECT pg_sleep(1)")

    def test_select_for_update_locks_rejected(self) -> None:
        import sqlglot
        from sqlglot import exp

        stmt = sqlglot.parse_one("SELECT 1")
        stmt.set("locks", [object()])
        with patch("website_profiling.tools.audit_tools.core.sql_query.assert_read_only_regex"), patch(
            "website_profiling.tools.audit_tools.core.sql_query.sqlglot.parse",
            return_value=[stmt],
        ):
            with pytest.raises(ReadOnlyViolation, match="FOR UPDATE"):
                assert_read_only("SELECT 1")

    def test_check_table_refs_skips_empty_table_name(self) -> None:
        from sqlglot import exp
        from website_profiling.tools.audit_tools.core.sql_query import _check_table_refs

        table = exp.Table(this=exp.to_identifier(""))
        select = exp.Select().from_(table)
        _check_table_refs(select)

    def test_get_sql_schema_skips_unlisted_dict_fk(self) -> None:
        from contextlib import contextmanager

        col_rows = [
            {"table_name": "crawl_runs", "column_name": "id", "data_type": "bigint",
             "is_nullable": "NO", "constraint_type": "PRIMARY KEY"},
        ]
        fk_rows = [
            {"table_name": "pipeline_jobs", "column_name": "id", "foreign_table": "properties", "foreign_column": "id"},
        ]

        class _FakeCursor:
            _call_count = 0
            description = [("table_name",), ("column_name",), ("data_type",),
                           ("is_nullable",), ("constraint_type",)]

            def execute(self, sql: str) -> None:
                pass

            def fetchall(self):
                _FakeCursor._call_count += 1
                return col_rows if _FakeCursor._call_count == 1 else fk_rows

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
        def _fake_ro():
            _FakeCursor._call_count = 0
            yield _FakeConn()

        with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _fake_ro):
            result = get_sql_schema(MagicMock(), AuditToolContext(), {})
        assert result["tables"][0]["foreign_keys"] == []

    def test_run_sql_query_bad_row_cap_defaults(self) -> None:
        from contextlib import contextmanager

        @contextmanager
        def _ro():
            cur = MagicMock()
            cur.description = [("n",)]
            cur.fetchall.return_value = [(1,)]
            conn = MagicMock()
            conn.cursor.return_value.__enter__.return_value = cur
            yield conn

        with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _ro):
            result = run_sql_query(MagicMock(), AuditToolContext(), {"sql": "SELECT 1", "row_cap": "bad"})
        assert result["row_count"] == 1

    def test_run_sql_query_continues_when_reparse_fails(self) -> None:
        from contextlib import contextmanager

        @contextmanager
        def _ro():
            cur = MagicMock()
            cur.description = [("n",)]
            cur.fetchall.return_value = [(1,)]
            conn = MagicMock()
            conn.cursor.return_value.__enter__.return_value = cur
            yield conn

        with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _ro), patch(
            "website_profiling.tools.audit_tools.core.sql_query.assert_read_only",
        ), patch(
            "website_profiling.tools.audit_tools.core.sql_query.sqlglot.parse",
            side_effect=RuntimeError("parse fail"),
        ):
            result = run_sql_query(MagicMock(), AuditToolContext(property_id=1), {"sql": "SELECT 1"})
        assert result["row_count"] == 1

    def test_run_sql_query_scope_injection_rejected(self) -> None:
        import sqlglot

        with patch("website_profiling.tools.audit_tools.core.sql_query.assert_read_only"), patch(
            "website_profiling.tools.audit_tools.core.sql_query.sqlglot.parse",
            return_value=[sqlglot.parse_one("SELECT 1")],
        ), patch(
            "website_profiling.tools.audit_tools.core.sql_query._inject_scope_ctes",
            side_effect=ReadOnlyViolation("scope fail"),
        ):
            scoped = run_sql_query(MagicMock(), AuditToolContext(property_id=1), {"sql": "SELECT 1"})
        assert "scope fail" in scoped["error"]

    def test_get_sql_schema_skips_unlisted_tuple_fk(self) -> None:
        from contextlib import contextmanager

        col_rows = [("crawl_runs", "id", "bigint", "NO", "PRIMARY KEY")]
        fk_rows = [("pipeline_jobs", "id", "properties", "id")]

        class _FakeCursor:
            _call_count = 0

            def execute(self, sql: str) -> None:
                pass

            def fetchall(self):
                _FakeCursor._call_count += 1
                return col_rows if _FakeCursor._call_count == 1 else fk_rows

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
        def _fake_ro():
            _FakeCursor._call_count = 0
            yield _FakeConn()

        with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _fake_ro):
            result = get_sql_schema(MagicMock(), AuditToolContext(), {})
        assert result["tables"][0]["foreign_keys"] == []
