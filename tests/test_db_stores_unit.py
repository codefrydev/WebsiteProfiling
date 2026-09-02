import pandas as pd

from tests.db_test_fakes import FakeConn, FakeCursor


def test_read_pipeline_config_splits_known_and_unknown() -> None:
    from website_profiling.db.config_store import read_pipeline_config

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[],
            fetchone_value=None,
        )
    )
    known, unknown = read_pipeline_config(conn)  # type: ignore[arg-type]
    assert unknown == []
    assert "start_url" in known


def test_write_pipeline_config_patches_typed_tables() -> None:
    from website_profiling.db.config_store import write_pipeline_config

    conn = FakeConn()
    write_pipeline_config(conn, entries={"start_url": "https://x"})  # type: ignore[arg-type]
    sqls = [s for (s, _p) in conn.executed]
    assert any("UPDATE" in s for s in sqls)


def test_crawl_rows_from_df_skips_missing_url() -> None:
    from website_profiling.db.crawl_store import _crawl_rows_from_df

    df = pd.DataFrame(
        [
            {"url": "https://a.com/", "status": 200, "title": "A", "x": 1},
            {"url": "", "status": 200, "title": "B", "x": 2},
        ]
    )
    rows = _crawl_rows_from_df(df, crawl_run_id=7)
    assert rows[0][0] == 7
    assert rows[0][1] == "https://a.com/"
    assert len(rows) == 1


def test_read_report_payload_handles_missing_and_dict() -> None:
    from website_profiling.db.report_store import read_report_payload

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert read_report_payload(conn) is None  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": {"ok": True}}))
    assert read_report_payload(conn) == {"ok": True}  # type: ignore[arg-type]


def test_llm_cache_roundtrip_parsing() -> None:
    from website_profiling.db.llm_cache_store import read_llm_cache, read_llm_cache_batch

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"response_json": {"a": 1}}))
    assert read_llm_cache(conn, "k") == '{"a": 1}'  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"response_json": None}))
    assert read_llm_cache(conn, "k") is None  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"cache_key": "k1", "response_json": {"x": 1}},
                {"cache_key": "k2", "response_json": '{"y": 2}'},
                {"cache_key": "k3", "response_json": "not-json"},
            ]
        )
    )
    out = read_llm_cache_batch(conn, ["k1", "k2", "k3"])  # type: ignore[arg-type]
    assert out["k1"] == {"x": 1}
    assert out["k2"] == {"y": 2}
    assert "k3" not in out


def test_edges_and_nodes_write_and_read_paths() -> None:
    from website_profiling.db.crawl_store import read_edges, read_nodes, write_edges, write_nodes

    conn = FakeConn()
    # read_edges: return two rows
    conn.set_next_cursor(FakeCursor(fetchall_value=[{"from_url": "a", "to_url": "b"}, {"from_url": "b", "to_url": "c"}]))
    assert read_edges(conn, run_id=1) == [("a", "b"), ("b", "c")]  # type: ignore[arg-type]

    # write_edges: with explicit run id, should delete then insert + commit
    conn = FakeConn()
    write_edges(conn, [("https://a.com/", "https://b.com/")], crawl_run_id=5)  # type: ignore[arg-type]
    assert conn.commits == 1
    assert any("DELETE FROM edges" in s for (s, _p) in conn.executed)

    # write_nodes: empty df clears table
    conn = FakeConn()
    write_nodes(conn, pd.DataFrame(), crawl_run_id=2)  # type: ignore[arg-type]
    assert conn.commits == 1

    # read_nodes: rows -> dataframe with columns
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[{"url": "u1", "count": 2}, {"url": "u2", "count": 1}]))
    df = read_nodes(conn, run_id=3)  # type: ignore[arg-type]
    assert df.shape[0] == 2


def test_lighthouse_store_summary_and_run_id() -> None:
    from website_profiling.db.lighthouse_store import read_lighthouse_summary, write_lighthouse_run, write_lighthouse_summary

    conn = FakeConn()
    write_lighthouse_summary(conn, {"a": 1})  # type: ignore[arg-type]
    assert conn.commits == 1

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": {"ok": True}}))
    assert read_lighthouse_summary(conn) == {"ok": True}  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": 9}))
    rid = write_lighthouse_run(conn, url="u", strategy="mobile", run_index=0, data={"x": 1})  # type: ignore[arg-type]
    assert rid == 9


class _LegacyConn:
    """Minimal conn used by config/llm/report store error-path tests."""

    def __init__(self, row=None, rows=None, boom=False):
        self.row = row
        self.rows = rows or []
        self.boom = boom
        self.commits = 0
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        if self.boom:
            raise RuntimeError("boom")
        return self

    def fetchone(self):
        return self.row

    def fetchall(self):
        return list(self.rows)

    def commit(self):
        self.commits += 1

    def transaction(self):
        class _CM:
            def __enter__(self_non):
                return None

            def __exit__(self_non, _t, _v, _tb):
                return False

        return _CM()


def test_config_store_read_error_fallbacks() -> None:
    from website_profiling.db.config_store import read_llm_config, read_pipeline_config

    known, unknown = read_pipeline_config(_LegacyConn(boom=True))  # type: ignore[arg-type]
    assert known == {}
    assert unknown == []
    assert read_llm_config(_LegacyConn(boom=True)) == {}  # type: ignore[arg-type]


def test_config_store_write_llm_config() -> None:
    from website_profiling.db.config_store import write_llm_config

    conn = _LegacyConn()
    write_llm_config(conn, {"llm_enabled": "true", "llm_provider": "ollama"}, secret_keys=set())  # type: ignore[arg-type]
    assert any("INSERT INTO" in s or "UPDATE" in s for s, _ in conn.executed)


def test_llm_cache_write_and_batch_read_error() -> None:
    from website_profiling.db.llm_cache_store import read_llm_cache_batch, write_llm_cache

    conn = _LegacyConn()
    write_llm_cache(conn, "k", '{"a":1}')  # type: ignore[arg-type]
    write_llm_cache(conn, "k", "not-json")  # type: ignore[arg-type]
    assert conn.commits == 2
    assert read_llm_cache_batch(_LegacyConn(boom=True), ["k"]) == {}  # type: ignore[arg-type]


def test_report_store_write_and_read_none() -> None:
    from website_profiling.db.report_store import _extract_hostname, read_report_payload, write_report_payload

    conn = _LegacyConn(row=None)
    assert read_report_payload(conn) is None  # type: ignore[arg-type]
    conn2 = _LegacyConn()
    write_report_payload(conn2, {"site_name": "S", "top_pages": [{"url": "https://x.com"}]})  # type: ignore[arg-type]
    assert conn2.commits == 1
    assert _extract_hostname("https://X.com/a") == "x.com"


def test_report_store_writes_audit_health_snapshot() -> None:
    from website_profiling.db.report_store import write_report_payload

    conn = _LegacyConn(row=(42,))
    write_report_payload(
        conn,  # type: ignore[arg-type]
        {
            "site_name": "Health Site",
            "property_id": 7,
            "categories": [
                {"id": "technical_seo", "score": 80, "issues": [{"priority": "High"}]},
                {"id": "link_health", "score": 60, "issues": [{"priority": "Critical"}, {"priority": "Low"}]},
            ],
        },
    )
    audit_sql = [(s, p) for s, p in conn.executed if "audit_health_snapshots" in s]
    assert audit_sql
    assert audit_sql[0][1][0] == 7
    assert audit_sql[0][1][3] == 70


def test_report_store_health_snapshot_skips_invalid_entries() -> None:
    from website_profiling.db.report_store import write_report_payload

    conn = _LegacyConn(row=(1,))
    write_report_payload(
        conn,  # type: ignore[arg-type]
        {
            "site_name": "X",
            "property_id": "not-a-number",
            "categories": [
                "bad",
                {"id": "ok", "score": 50, "issues": ["bad", {"priority": "High"}]},
            ],
        },
    )
    audit = [(s, p) for s, p in conn.executed if "audit_health_snapshots" in s][0]
    assert audit[1][0] is None
    assert audit[1][3] == 50


def test_report_store_health_snapshot_insert_failure_is_ignored() -> None:
    from website_profiling.db.report_store import write_report_payload

    class _BoomOnAudit(_LegacyConn):
        def execute(self, sql, params=None):
            if "audit_health_snapshots" in sql:
                raise RuntimeError("no table")
            return super().execute(sql, params)

    conn = _BoomOnAudit(row=(2,))
    write_report_payload(conn, {"site_name": "Y", "categories": []})  # type: ignore[arg-type]
    assert conn.commits == 1


def test_read_report_payloads_batch_empty_and_rows() -> None:
    from website_profiling.db.report_store import read_report_payloads, read_report_payloads_portfolio

    assert read_report_payloads(FakeConn(), []) == {}  # type: ignore[arg-type]
    assert read_report_payloads_portfolio(FakeConn(), []) == {}  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"id": 1, "data": {"site_name": "A", "summary": {"urls": 10}}},
                {"id": 2, "data": '{"site_name":"B"}'},
                {"id": None, "data": {"skip": True}},
                {"id": 3, "data": "not-json"},
            ]
        )
    )
    assert read_report_payloads(conn, [1, 2, 3]) == {  # type: ignore[arg-type]
        1: {"site_name": "A", "summary": {"urls": 10}},
        2: {"site_name": "B"},
    }

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"id": 5, "data": {"site_name": "Lite", "summary": {"score": 80}}},
                {"id": None, "data": {"skip": True}},
            ]
        )
    )
    assert read_report_payloads_portfolio(conn, [5]) == {5: {"site_name": "Lite", "summary": {"score": 80}}}  # type: ignore[arg-type]


def test_read_report_payloads_batch_execute_failure() -> None:
    from website_profiling.db.report_store import read_report_payloads, read_report_payloads_portfolio

    class _BoomConn(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("db down")

    boom = _BoomConn()
    assert read_report_payloads(boom, [1]) == {}  # type: ignore[arg-type]
    assert read_report_payloads_portfolio(boom, [1]) == {}  # type: ignore[arg-type]

