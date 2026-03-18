"""
SQLite data layer for WebsiteProfiling: single DB for crawl, edges, nodes, lighthouse, report payload.
"""
import json
import math
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively replace NaN/Inf and numpy types so JSON is valid (no literal NaN)."""
    if obj is None:
        return None
    if isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, int):
        return int(obj)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if hasattr(obj, "item"):  # numpy scalar
        try:
            return _sanitize_for_json(obj.item())
        except (ValueError, AttributeError):
            return None
    if hasattr(obj, "isoformat"):  # datetime
        return obj.isoformat()
    return obj


def ensure_db_recreated(db_path: str) -> None:
    """Delete existing DB file (and journal) so the next get_connection creates a fresh DB."""
    for p in (db_path, db_path + "-journal"):
        if Path(p).exists():
            try:
                Path(p).unlink()
            except OSError:
                pass


def get_connection(db_path: str) -> sqlite3.Connection:
    """Open or create SQLite DB; return connection (no init_schema called)."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they do not exist. crawl_results is created by write_crawl from DataFrame."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS crawl_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            start_url TEXT
        );

        CREATE TABLE IF NOT EXISTS edges (
            from_url TEXT NOT NULL,
            to_url TEXT NOT NULL,
            PRIMARY KEY (from_url, to_url)
        );

        CREATE TABLE IF NOT EXISTS nodes (
            url TEXT PRIMARY KEY,
            count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lighthouse_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lighthouse_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            url TEXT NOT NULL,
            strategy TEXT NOT NULL,
            run_index INTEGER NOT NULL,
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lighthouse_page_summaries (
            url TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS report_payload (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            generated_at TEXT NOT NULL,
            data TEXT NOT NULL
        );
    """)
    conn.commit()
    _migrate_to_crawl_runs(conn)
    _migrate_new_crawl_columns(conn)


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    """Return True if table has the given column."""
    try:
        cur = conn.execute(f"PRAGMA table_info({table})")
        return any(row[1] == column for row in cur.fetchall())
    except Exception:
        return False


_NEW_CRAWL_COLUMNS = [
    ("word_count", "INTEGER DEFAULT 0"),
    ("reading_level", "REAL DEFAULT 0"),
    ("content_html_ratio", "REAL DEFAULT 0"),
    ("top_keywords", "TEXT DEFAULT '[]'"),
    ("og_title", "TEXT DEFAULT ''"),
    ("og_description", "TEXT DEFAULT ''"),
    ("og_image", "TEXT DEFAULT ''"),
    ("og_type", "TEXT DEFAULT ''"),
    ("twitter_card", "TEXT DEFAULT ''"),
    ("twitter_title", "TEXT DEFAULT ''"),
    ("twitter_image", "TEXT DEFAULT ''"),
    ("tech_stack", "TEXT DEFAULT '[]'"),
    ("depth", "INTEGER"),
]


def _migrate_new_crawl_columns(conn: sqlite3.Connection) -> None:
    """Add new content/social/tech columns to crawl_results if they don't exist yet."""
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'")
        if cur.fetchone() is None:
            return
    except Exception:
        return
    for col_name, col_def in _NEW_CRAWL_COLUMNS:
        if not _table_has_column(conn, "crawl_results", col_name):
            try:
                conn.execute(f"ALTER TABLE crawl_results ADD COLUMN {col_name} {col_def}")
            except Exception:
                pass
    conn.commit()


def _migrate_to_crawl_runs(conn: sqlite3.Connection) -> None:
    """If crawl_results or edges/nodes exist without crawl_run_id, add column and backfill run 1."""
    try:
        cur = conn.execute("SELECT COUNT(*) FROM crawl_runs")
        if cur.fetchone()[0] > 0:
            return
    except Exception:
        pass

    run_migration = False
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'")
        if cur.fetchone() is not None and not _table_has_column(conn, "crawl_results", "crawl_run_id"):
            run_migration = True
    except Exception:
        pass

    if not run_migration:
        try:
            cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='edges'")
            if cur.fetchone() is not None and not _table_has_column(conn, "edges", "crawl_run_id"):
                run_migration = True
        except Exception:
            pass

    if not run_migration:
        return

    conn.execute(
        "INSERT INTO crawl_runs (id, created_at, start_url) VALUES (1, datetime('now'), NULL)"
    )
    conn.commit()

    if _table_has_column(conn, "crawl_results", "crawl_run_id"):
        pass
    else:
        try:
            conn.execute("ALTER TABLE crawl_results ADD COLUMN crawl_run_id INTEGER DEFAULT 1")
            conn.execute("UPDATE crawl_results SET crawl_run_id = 1 WHERE crawl_run_id IS NULL")
            conn.commit()
        except Exception:
            pass

    for table, pk in [("edges", "crawl_run_id, from_url, to_url"), ("nodes", "crawl_run_id, url")]:
        try:
            if not _table_has_column(conn, table, "crawl_run_id"):
                if table == "edges":
                    conn.executescript("""
                        CREATE TABLE edges_new (crawl_run_id INTEGER NOT NULL, from_url TEXT NOT NULL, to_url TEXT NOT NULL, PRIMARY KEY (crawl_run_id, from_url, to_url));
                        INSERT INTO edges_new SELECT 1, from_url, to_url FROM edges;
                        DROP TABLE edges;
                        ALTER TABLE edges_new RENAME TO edges;
                    """)
                else:
                    conn.executescript("""
                        CREATE TABLE nodes_new (crawl_run_id INTEGER NOT NULL, url TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (crawl_run_id, url));
                        INSERT INTO nodes_new SELECT 1, url, count FROM nodes;
                        DROP TABLE nodes;
                        ALTER TABLE nodes_new RENAME TO nodes;
                    """)
                conn.commit()
        except Exception:
            pass


def create_crawl_run(conn: sqlite3.Connection, start_url: Optional[str] = None) -> int:
    """Insert a new crawl run and return its id."""
    conn.execute(
        "INSERT INTO crawl_runs (created_at, start_url) VALUES (?, ?)",
        (time.strftime("%Y-%m-%d %H:%M:%S"), start_url),
    )
    conn.commit()
    cur = conn.execute("SELECT last_insert_rowid()")
    return int(cur.fetchone()[0])


def get_latest_crawl_run_id(conn: sqlite3.Connection) -> Optional[int]:
    """Return the latest crawl run id, or None if no runs."""
    try:
        cur = conn.execute("SELECT id FROM crawl_runs ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        return int(row[0]) if row else None
    except Exception:
        return None


def get_crawl_run_info(conn: sqlite3.Connection, run_id: int) -> Optional[dict[str, Any]]:
    """Return dict with created_at, start_url for the given run_id, or None."""
    try:
        cur = conn.execute("SELECT created_at, start_url FROM crawl_runs WHERE id = ?", (run_id,))
        row = cur.fetchone()
        if row is None:
            return None
        return {"created_at": row[0], "start_url": row[1]}
    except Exception:
        return None


def _ensure_crawl_table_from_df(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    """Recreate crawl_results table to match DataFrame columns (for varying crawler output)."""
    conn.execute("DROP TABLE IF EXISTS crawl_results")
    conn.commit()
    df.to_sql("crawl_results", conn, index=False, if_exists="replace")
    conn.commit()


def write_crawl(conn: sqlite3.Connection, df: pd.DataFrame, crawl_run_id: Optional[int] = None) -> None:
    """Write crawl results. If crawl_run_id is set, append rows for that run; else replace table (legacy)."""
    if df.empty:
        if crawl_run_id is None:
            init_schema(conn)
            try:
                conn.execute("DELETE FROM crawl_results")
            except Exception:
                pass
            conn.commit()
        return
    df = df.copy()
    if "url" in df.columns:
        df["url"] = df["url"].astype(str).str.rstrip("/")
    for col in df.columns:
        if df[col].dtype == bool:
            df[col] = df[col].astype(int)

    if crawl_run_id is not None:
        _migrate_to_crawl_runs(conn)
        df["crawl_run_id"] = crawl_run_id
        try:
            cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'")
            if cur.fetchone() is None:
                cols = ["crawl_run_id"] + [c for c in df.columns if c != "crawl_run_id"]
                df[cols].to_sql("crawl_results", conn, index=False, if_exists="replace")
            else:
                cur = conn.execute("PRAGMA table_info(crawl_results)")
                table_cols = [row[1] for row in cur.fetchall()]
                if table_cols[0] == "crawl_run_id":
                    df.to_sql("crawl_results", conn, index=False, if_exists="append", method="multi")
                else:
                    df[table_cols].to_sql("crawl_results", conn, index=False, if_exists="append", method="multi")
        finally:
            df.drop(columns=["crawl_run_id"], inplace=True, errors="ignore")
        conn.commit()
        return
    df.to_sql("crawl_results", conn, index=False, if_exists="replace")
    conn.commit()


def read_crawl(conn: sqlite3.Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    """Read crawl_results into a DataFrame. If run_id is None, use latest crawl run."""
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
            if run_id is None:
                df = pd.read_sql("SELECT * FROM crawl_results", conn)
            else:
                if _table_has_column(conn, "crawl_results", "crawl_run_id"):
                    df = pd.read_sql("SELECT * FROM crawl_results WHERE crawl_run_id = ?", conn, params=(run_id,))
                else:
                    df = pd.read_sql("SELECT * FROM crawl_results", conn)
        else:
            if _table_has_column(conn, "crawl_results", "crawl_run_id"):
                df = pd.read_sql("SELECT * FROM crawl_results WHERE crawl_run_id = ?", conn, params=(run_id,))
            else:
                df = pd.read_sql("SELECT * FROM crawl_results", conn)
    except Exception:
        return pd.DataFrame()
    if df.empty:
        return df
    if "crawl_run_id" in df.columns:
        df = df.drop(columns=["crawl_run_id"], errors="ignore")
    bool_cols = [
        "viewport_present", "noindex", "has_schema",
    ]
    for c in bool_cols:
        if c in df.columns:
            df[c] = df[c].astype(bool)
    return df


def write_edges(conn: sqlite3.Connection, edges: list[tuple[str, str]], crawl_run_id: Optional[int] = None) -> None:
    """Write edges. If crawl_run_id is set, insert for that run; else replace (legacy or replace latest run)."""
    if crawl_run_id is None:
        conn.execute("DELETE FROM edges")
        if edges:
            if _table_has_column(conn, "edges", "crawl_run_id"):
                rid = get_latest_crawl_run_id(conn)
                if rid is not None:
                    conn.execute("DELETE FROM edges WHERE crawl_run_id = ?", (rid,))
                    conn.executemany(
                        "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (?, ?, ?)",
                        [(rid, a.rstrip("/"), b.rstrip("/")) for a, b in edges],
                    )
            else:
                conn.executemany(
                    "INSERT INTO edges (from_url, to_url) VALUES (?, ?)",
                    [(a.rstrip("/"), b.rstrip("/")) for a, b in edges],
                )
        conn.commit()
        return
    _migrate_to_crawl_runs(conn)
    conn.execute("DELETE FROM edges WHERE crawl_run_id = ?", (crawl_run_id,))
    if edges:
        conn.executemany(
            "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (?, ?, ?)",
            [(crawl_run_id, a.rstrip("/"), b.rstrip("/")) for a, b in edges],
        )
    conn.commit()


def read_edges(conn: sqlite3.Connection, run_id: Optional[int] = None) -> list[tuple[str, str]]:
    """Read edges. If run_id is None, use latest crawl run."""
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is not None and _table_has_column(conn, "edges", "crawl_run_id"):
            cur = conn.execute("SELECT from_url, to_url FROM edges WHERE crawl_run_id = ?", (run_id,))
        else:
            cur = conn.execute("SELECT from_url, to_url FROM edges")
        return [tuple(row) for row in cur.fetchall()]
    except Exception:
        return []


def write_nodes(conn: sqlite3.Connection, df: pd.DataFrame, crawl_run_id: Optional[int] = None) -> None:
    """Write nodes. If crawl_run_id is set, insert for that run; else replace (legacy)."""
    if df.empty:
        if crawl_run_id is None:
            conn.execute("DELETE FROM nodes")
        conn.commit()
        return
    ndf = df.copy()
    if "index" in ndf.columns and "url" not in ndf.columns:
        ndf = ndf.rename(columns={"index": "url"})
    if "url" not in ndf.columns or "count" not in ndf.columns:
        return
    if crawl_run_id is None:
        ndf[["url", "count"]].to_sql("nodes", conn, index=False, if_exists="replace")
        conn.commit()
        return
    _migrate_to_crawl_runs(conn)
    conn.execute("DELETE FROM nodes WHERE crawl_run_id = ?", (crawl_run_id,))
    ndf["crawl_run_id"] = crawl_run_id
    ndf[["crawl_run_id", "url", "count"]].to_sql("nodes", conn, index=False, if_exists="append", method="multi")
    conn.commit()


def read_nodes(conn: sqlite3.Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    """Read nodes. If run_id is None, use latest crawl run."""
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is not None and _table_has_column(conn, "nodes", "crawl_run_id"):
            return pd.read_sql("SELECT url, count FROM nodes WHERE crawl_run_id = ?", conn, params=(run_id,))
        return pd.read_sql("SELECT * FROM nodes", conn)
    except Exception:
        return pd.DataFrame(columns=["url", "count"])


def write_lighthouse_summary(conn: sqlite3.Connection, summary: dict[str, Any]) -> None:
    """Append a lighthouse summary row (JSON in data column)."""
    conn.execute(
        "INSERT INTO lighthouse_summary (created_at, data) VALUES (?, ?)",
        (time.strftime("%Y-%m-%d %H:%M:%S"), json.dumps(_sanitize_for_json(summary), default=str)),
    )
    conn.commit()


def read_lighthouse_summary(conn: sqlite3.Connection) -> Optional[dict[str, Any]]:
    """Return the latest lighthouse summary dict, or None."""
    try:
        cur = conn.execute(
            "SELECT data FROM lighthouse_summary ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row is None:
            return None
        return json.loads(row[0])
    except Exception:
        return None


def write_lighthouse_run(
    conn: sqlite3.Connection,
    url: str,
    strategy: str,
    run_index: int,
    data: dict[str, Any],
) -> None:
    """Append one raw Lighthouse run report (full JSON) to lighthouse_runs."""
    conn.execute(
        "INSERT INTO lighthouse_runs (created_at, url, strategy, run_index, data) VALUES (?, ?, ?, ?, ?)",
        (time.strftime("%Y-%m-%d %H:%M:%S"), url, strategy, run_index, json.dumps(_sanitize_for_json(data), default=str)),
    )
    conn.commit()


def write_lighthouse_page_summary(
    conn: sqlite3.Connection,
    url: str,
    summary: dict[str, Any],
) -> None:
    """Write or replace Lighthouse summary for a single URL (latest run wins)."""
    conn.execute(
        """INSERT OR REPLACE INTO lighthouse_page_summaries (url, created_at, data)
           VALUES (?, ?, ?)""",
        (
            url,
            time.strftime("%Y-%m-%d %H:%M:%S"),
            json.dumps(_sanitize_for_json(summary), default=str),
        ),
    )
    conn.commit()


def read_lighthouse_page_summaries(conn: sqlite3.Connection) -> dict[str, Any]:
    """Return dict mapping url -> summary dict for all per-URL Lighthouse summaries."""
    out: dict[str, Any] = {}
    try:
        cur = conn.execute(
            "SELECT url, data FROM lighthouse_page_summaries"
        )
        for row in cur.fetchall():
            try:
                out[str(row[0])] = json.loads(row[1])
            except (TypeError, json.JSONDecodeError):
                continue
    except Exception:
        pass
    return out


def write_report_payload(conn: sqlite3.Connection, report_data: dict[str, Any]) -> None:
    """Insert the report payload JSON (used by frontend). NaN/Inf sanitized so JSON is valid."""
    conn.execute(
        "INSERT INTO report_payload (generated_at, data) VALUES (?, ?)",
        (time.strftime("%Y-%m-%d %H:%M:%S"), json.dumps(_sanitize_for_json(report_data), default=str)),
    )
    conn.commit()


def read_report_payload(conn: sqlite3.Connection) -> Optional[dict[str, Any]]:
    """Return the latest report payload dict, or None."""
    try:
        cur = conn.execute(
            "SELECT data FROM report_payload ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row is None:
            return None
        return json.loads(row[0])
    except Exception:
        return None
