from __future__ import annotations

import types


class Conn:
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
        class CM:
            def __enter__(self_non):
                return None

            def __exit__(self_non, _t, _v, _tb):
                return False

        return CM()


def test_config_store_error_fallbacks():
    from website_profiling.db.config_store import read_llm_config, read_pipeline_config

    known, unknown = read_pipeline_config(Conn(boom=True))  # type: ignore[arg-type]
    assert known == {}
    assert unknown == []
    assert read_llm_config(Conn(boom=True)) == {}  # type: ignore[arg-type]


def test_config_store_write_llm_config_commits():
    from website_profiling.db.config_store import write_llm_config

    conn = Conn()
    write_llm_config(conn, {"k": "v"}, secret_keys={"k"})  # type: ignore[arg-type]
    assert conn.commits == 0  # transaction style; no explicit commit in function
    assert any("INSERT INTO llm_config" in s for s, _ in conn.executed)


def test_llm_cache_write_and_error_paths():
    from website_profiling.db.llm_cache_store import read_llm_cache_batch, write_llm_cache

    conn = Conn()
    write_llm_cache(conn, "k", '{"a":1}')  # type: ignore[arg-type]
    write_llm_cache(conn, "k", "not-json")  # type: ignore[arg-type]
    assert conn.commits == 2

    # exception branch
    assert read_llm_cache_batch(Conn(boom=True), ["k"]) == {}  # type: ignore[arg-type]


def test_report_store_write_and_read_none():
    from website_profiling.db.report_store import _extract_hostname, read_report_payload, write_report_payload

    conn = Conn(row=None)
    assert read_report_payload(conn) is None  # type: ignore[arg-type]
    conn2 = Conn()
    write_report_payload(conn2, {"site_name": "S", "top_pages": [{"url": "https://x.com"}]})  # type: ignore[arg-type]
    assert conn2.commits == 1
    assert _extract_hostname("https://X.com/a") == "x.com"

