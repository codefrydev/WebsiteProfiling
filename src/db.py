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

        CREATE TABLE IF NOT EXISTS report_payload (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            generated_at TEXT NOT NULL,
            data TEXT NOT NULL
        );
    """)
    conn.commit()


def _ensure_crawl_table_from_df(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    """Recreate crawl_results table to match DataFrame columns (for varying crawler output)."""
    conn.execute("DROP TABLE IF EXISTS crawl_results")
    conn.commit()
    df.to_sql("crawl_results", conn, index=False, if_exists="replace")
    conn.commit()


def write_crawl(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    """Replace crawl_results with the given DataFrame. Columns are taken from df."""
    if df.empty:
        init_schema(conn)
        conn.execute("DELETE FROM crawl_results")
        conn.commit()
        return
    # Normalize: ensure url is string, strip trailing slash
    df = df.copy()
    if "url" in df.columns:
        df["url"] = df["url"].astype(str).str.rstrip("/")
    # Store booleans as 0/1 for SQLite
    for col in df.columns:
        if df[col].dtype == bool:
            df[col] = df[col].astype(int)
    df.to_sql("crawl_results", conn, index=False, if_exists="replace")
    conn.commit()


def read_crawl(conn: sqlite3.Connection) -> pd.DataFrame:
    """Read crawl_results into a DataFrame. Returns empty DataFrame if table missing or empty."""
    try:
        df = pd.read_sql("SELECT * FROM crawl_results", conn)
    except Exception:
        return pd.DataFrame()
    if df.empty:
        return df
    # Restore booleans for columns that were stored as 0/1
    bool_cols = [
        "viewport_present", "noindex", "has_schema",
    ]
    for c in bool_cols:
        if c in df.columns:
            df[c] = df[c].astype(bool)
    return df


def write_edges(conn: sqlite3.Connection, edges: list[tuple[str, str]]) -> None:
    """Replace edges table with (from_url, to_url) pairs."""
    conn.execute("DELETE FROM edges")
    if edges:
        conn.executemany(
            "INSERT INTO edges (from_url, to_url) VALUES (?, ?)",
            [(a.rstrip("/"), b.rstrip("/")) for a, b in edges],
        )
    conn.commit()


def read_edges(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """Read edges as list of (from_url, to_url)."""
    try:
        cur = conn.execute("SELECT from_url, to_url FROM edges")
        return [tuple(row) for row in cur.fetchall()]
    except Exception:
        return []


def write_nodes(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    """Replace nodes table. df must have columns url, count (or 'index' for url if from value_counts)."""
    if df.empty:
        conn.execute("DELETE FROM nodes")
        conn.commit()
        return
    ndf = df.copy()
    if "index" in ndf.columns and "url" not in ndf.columns:
        ndf = ndf.rename(columns={"index": "url"})
    if "url" not in ndf.columns or "count" not in ndf.columns:
        return
    ndf[["url", "count"]].to_sql("nodes", conn, index=False, if_exists="replace")
    conn.commit()


def read_nodes(conn: sqlite3.Connection) -> pd.DataFrame:
    """Read nodes table. Returns DataFrame with url, count."""
    try:
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
