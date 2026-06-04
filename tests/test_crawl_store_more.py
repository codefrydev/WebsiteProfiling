import pandas as pd

from tests.db_test_fakes import FakeConn, FakeCursor


def test_write_crawl_empty_clears_table_when_no_run_id() -> None:
    from website_profiling.db.crawl_store import write_crawl

    conn = FakeConn()
    write_crawl(conn, pd.DataFrame(), crawl_run_id=None)  # type: ignore[arg-type]
    assert conn.commits == 1


def test_read_crawl_returns_empty_df_when_no_rows() -> None:
    from website_profiling.db.crawl_store import read_crawl

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[]))
    df = read_crawl(conn, run_id=1)  # type: ignore[arg-type]
    assert df.empty

