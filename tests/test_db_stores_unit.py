import pandas as pd

from tests.db_test_fakes import FakeConn, FakeCursor


def test_read_pipeline_config_splits_known_and_unknown() -> None:
    from website_profiling.db.config_store import read_pipeline_config

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"key": "start_url", "value": "https://x", "is_unknown": False},
                {"key": "weird_key", "value": "123", "is_unknown": True},
            ]
        )
    )
    known, unknown = read_pipeline_config(conn)  # type: ignore[arg-type]
    assert known["start_url"] == "https://x"
    assert unknown == [{"key": "weird_key", "value": "123"}]


def test_write_pipeline_config_writes_known_and_unknown() -> None:
    from website_profiling.db.config_store import write_pipeline_config

    conn = FakeConn()
    write_pipeline_config(  # type: ignore[arg-type]
        conn,
        entries={"a": "1", "b": "2"},
        unknown_keys=[{"key": "x", "value": "y"}],
    )
    sqls = [s for (s, _p) in conn.executed]
    assert any("DELETE FROM pipeline_config" in s for s in sqls)
    assert sum("INSERT INTO pipeline_config" in s for s in sqls) >= 3


def test_crawl_rows_from_df_skips_missing_url_and_strips_trailing_slash() -> None:
    from website_profiling.db.crawl_store import _crawl_rows_from_df

    df = pd.DataFrame(
        [
            {"url": "https://a.com/", "status": 200, "title": "A", "x": 1},
            {"url": "", "status": 200, "title": "B", "x": 2},
        ]
    )
    rows = _crawl_rows_from_df(df, crawl_run_id=7)
    assert rows[0][0] == 7
    assert rows[0][1] == "https://a.com"
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

