"""
SQLite data layer for WebsiteProfiling: single DB for crawl, edges, nodes, lighthouse, report payload.
"""
import json
import math
import os
import shutil
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


def backup_db_if_exists(db_path: str, skip_in_ci: bool = True) -> Optional[str]:
    """Copy db_path to a timestamped backup file and return the backup path, or None.

    Returns None without creating a backup when:
    - skip_in_ci is True and the process is running in GitHub Actions or a generic CI environment.
    - The db_path file does not exist.
    """
    if skip_in_ci and (
        os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("CI") == "true"
    ):
        return None
    p = Path(db_path)
    if not p.exists() or not p.is_file():
        return None
    suffix = time.strftime("%Y%m%d-%H%M%S")
    backup = p.parent / f"{p.name}.backup-{suffix}"
    shutil.copy2(str(p), str(backup))
    journal = Path(str(p) + "-journal")
    if journal.exists():
        try:
            shutil.copy2(str(journal), str(backup) + "-journal")
        except OSError:
            pass
    return str(backup)


def read_historical_data(db_path: str) -> dict[str, list]:
    """Read rows from historical tables in an existing DB before it is overwritten.

    Returns a dict mapping table name -> list of row dicts.
    Tables captured: report_payload, lighthouse_summary, lighthouse_runs, lighthouse_page_summaries.
    crawl_results / edges / nodes are intentionally excluded (they belong to the new crawl).
    Returns empty lists for all tables when the DB file does not exist.
    """
    tables = ["report_payload", "lighthouse_summary", "lighthouse_runs", "lighthouse_page_summaries"]
    result: dict[str, list] = {t: [] for t in tables}
    p = Path(db_path)
    if not p.exists() or not p.is_file():
        return result
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        for table in tables:
            try:
                cur = conn.execute(f"SELECT * FROM {table}")
                result[table] = [dict(row) for row in cur.fetchall()]
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
    return result


def restore_historical_data(conn: sqlite3.Connection, data: dict[str, list]) -> None:
    """Insert previously-read historical rows back into a freshly-created DB.

    Uses INSERT OR IGNORE with explicit ids so rows are idempotent and the
    original row ordering (and thus UI report list ordering) is preserved.
    Silently skips any row that fails to insert.
    """
    for row in data.get("report_payload", []):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO report_payload (id, generated_at, data) VALUES (?, ?, ?)",
                (row.get("id"), row.get("generated_at"), row.get("data")),
            )
        except Exception:
            pass

    for row in data.get("lighthouse_summary", []):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO lighthouse_summary (id, created_at, data) VALUES (?, ?, ?)",
                (row.get("id"), row.get("created_at"), row.get("data")),
            )
        except Exception:
            pass

    for row in data.get("lighthouse_runs", []):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO lighthouse_runs (id, created_at, url, strategy, run_index, data) VALUES (?, ?, ?, ?, ?, ?)",
                (row.get("id"), row.get("created_at"), row.get("url"), row.get("strategy"), row.get("run_index"), row.get("data")),
            )
        except Exception:
            pass

    for row in data.get("lighthouse_page_summaries", []):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO lighthouse_page_summaries (url, created_at, data) VALUES (?, ?, ?)",
                (row.get("url"), row.get("created_at"), row.get("data")),
            )
        except Exception:
            pass

    conn.commit()


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


# ---------------------------------------------------------------------------
# Extended schema for SEO platform modules
# ---------------------------------------------------------------------------

def init_extended_schema(conn: sqlite3.Connection) -> None:
    """Create all extended SEO platform tables. Call after init_schema()."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            domain TEXT,
            settings TEXT DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tracked_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            keyword TEXT NOT NULL,
            location TEXT DEFAULT 'United States',
            device TEXT DEFAULT 'desktop',
            language TEXT DEFAULT 'en',
            tags TEXT DEFAULT '[]',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(project_id, keyword, location, device)
        );

        CREATE TABLE IF NOT EXISTS rank_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracked_keyword_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            position INTEGER,
            previous_position INTEGER,
            url TEXT,
            serp_features TEXT DEFAULT '[]',
            visibility_score REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tracked_keyword_id, date)
        );

        CREATE TABLE IF NOT EXISTS serp_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            location TEXT DEFAULT 'United States',
            device TEXT DEFAULT 'desktop',
            date TEXT NOT NULL,
            results TEXT DEFAULT '[]',
            features TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS keywords_db (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL UNIQUE,
            volume INTEGER DEFAULT 0,
            difficulty INTEGER DEFAULT 0,
            cpc REAL DEFAULT 0,
            trend_data TEXT DEFAULT '[]',
            clicks_per_search REAL DEFAULT 1,
            parent_topic TEXT DEFAULT '',
            search_intent TEXT DEFAULT 'informational',
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS keyword_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            name TEXT,
            parent_keyword TEXT,
            keywords TEXT DEFAULT '[]',
            volume_total INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS domain_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            domain_rating INTEGER DEFAULT 0,
            organic_traffic_est INTEGER DEFAULT 0,
            organic_keywords_count INTEGER DEFAULT 0,
            referring_domains_count INTEGER DEFAULT 0,
            backlinks_count INTEGER DEFAULT 0,
            traffic_value_est REAL DEFAULT 0,
            data TEXT DEFAULT '{}',
            fetched_at TEXT DEFAULT (datetime('now')),
            UNIQUE(domain)
        );

        CREATE TABLE IF NOT EXISTS backlinks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            source_url TEXT NOT NULL,
            target_url TEXT NOT NULL,
            anchor_text TEXT DEFAULT '',
            link_type TEXT DEFAULT 'text',
            is_dofollow INTEGER DEFAULT 1,
            domain_rating INTEGER DEFAULT 0,
            first_seen TEXT,
            last_seen TEXT,
            is_broken INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS referring_domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            target_domain TEXT NOT NULL,
            backlinks_count INTEGER DEFAULT 0,
            domain_rating INTEGER DEFAULT 0,
            first_seen TEXT,
            last_seen TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(domain, target_domain)
        );

        CREATE TABLE IF NOT EXISTS organic_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            keyword TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            volume INTEGER DEFAULT 0,
            traffic_est INTEGER DEFAULT 0,
            url TEXT,
            serp_features TEXT DEFAULT '[]',
            difficulty INTEGER DEFAULT 0,
            search_intent TEXT DEFAULT 'informational',
            fetched_at TEXT DEFAULT (datetime('now')),
            UNIQUE(domain, keyword)
        );

        CREATE TABLE IF NOT EXISTS paid_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            keyword TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            cpc REAL DEFAULT 0,
            ad_copy TEXT DEFAULT '',
            landing_page TEXT DEFAULT '',
            fetched_at TEXT DEFAULT (datetime('now')),
            UNIQUE(domain, keyword)
        );

        CREATE TABLE IF NOT EXISTS gsc_properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            site_url TEXT NOT NULL UNIQUE,
            access_token TEXT,
            refresh_token TEXT,
            last_synced_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS gsc_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            query TEXT NOT NULL,
            page TEXT,
            clicks INTEGER DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            ctr REAL DEFAULT 0,
            position REAL DEFAULT 0,
            device TEXT DEFAULT 'web',
            country TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            page_url TEXT,
            referrer TEXT,
            user_agent TEXT,
            event_type TEXT DEFAULT 'pageview',
            session_id TEXT,
            country TEXT,
            device TEXT,
            browser TEXT,
            is_bot INTEGER DEFAULT 0,
            bot_name TEXT,
            custom_data TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS analytics_funnels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            name TEXT NOT NULL,
            steps TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS content_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            title TEXT,
            domain TEXT,
            published_at TEXT,
            word_count INTEGER DEFAULT 0,
            traffic_est INTEGER DEFAULT 0,
            referring_domains_count INTEGER DEFAULT 0,
            social_shares INTEGER DEFAULT 0,
            language TEXT DEFAULT 'en',
            data TEXT DEFAULT '{}',
            indexed_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS content_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            url TEXT NOT NULL,
            keyword TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            details TEXT DEFAULT '{}',
            recommendations TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(url, keyword)
        );

        CREATE TABLE IF NOT EXISTS content_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            url TEXT NOT NULL,
            title TEXT,
            word_count INTEGER DEFAULT 0,
            published_at TEXT,
            last_updated TEXT,
            traffic_trend TEXT DEFAULT '[]',
            status TEXT DEFAULT 'published',
            author TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS brand_mentions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            brand_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            date TEXT,
            context_text TEXT,
            sentiment TEXT DEFAULT 'neutral',
            mention_type TEXT DEFAULT 'web',
            is_linked INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_citations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            brand_name TEXT NOT NULL,
            llm_platform TEXT NOT NULL,
            prompt TEXT,
            date TEXT,
            brand_mentioned INTEGER DEFAULT 0,
            url_cited TEXT,
            position INTEGER DEFAULT 0,
            sentiment TEXT DEFAULT 'neutral',
            response_text TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS domain_traffic (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            date TEXT NOT NULL,
            visits_est INTEGER DEFAULT 0,
            unique_visitors_est INTEGER DEFAULT 0,
            pages_per_visit REAL DEFAULT 0,
            bounce_rate REAL DEFAULT 0,
            avg_duration INTEGER DEFAULT 0,
            traffic_sources TEXT DEFAULT '{}',
            geo_data TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(domain, date)
        );

        CREATE TABLE IF NOT EXISTS market_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            name TEXT NOT NULL,
            domains TEXT DEFAULT '[]',
            metrics TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS social_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            platform TEXT NOT NULL,
            access_token TEXT,
            refresh_token TEXT,
            profile_data TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS social_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            account_ids TEXT DEFAULT '[]',
            content TEXT,
            media_urls TEXT DEFAULT '[]',
            scheduled_at TEXT,
            published_at TEXT,
            status TEXT DEFAULT 'draft',
            metrics TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS social_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            reach INTEGER DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ppc_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            keyword TEXT NOT NULL,
            cpc REAL DEFAULT 0,
            competition REAL DEFAULT 0,
            volume INTEGER DEFAULT 0,
            trend TEXT DEFAULT '[]',
            ad_groups TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ad_intelligence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            keyword TEXT NOT NULL,
            ad_copy TEXT,
            landing_page TEXT,
            position INTEGER DEFAULT 0,
            ad_type TEXT DEFAULT 'search',
            first_seen TEXT,
            last_seen TEXT,
            data TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS gbp_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            google_place_id TEXT,
            name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            postal_code TEXT,
            phone TEXT,
            website TEXT,
            category TEXT,
            categories TEXT DEFAULT '[]',
            hours TEXT DEFAULT '{}',
            metrics TEXT DEFAULT '{}',
            completeness_score INTEGER DEFAULT 0,
            last_synced_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS local_rank_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            keyword TEXT NOT NULL,
            location TEXT,
            lat REAL,
            lng REAL,
            date TEXT NOT NULL,
            local_rank INTEGER,
            organic_rank INTEGER,
            competitor_data TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gbp_profile_id INTEGER,
            reviewer_name TEXT,
            rating INTEGER DEFAULT 0,
            text TEXT,
            published_at TEXT,
            response TEXT,
            response_at TEXT,
            sentiment TEXT DEFAULT 'neutral',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS citations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            directory TEXT NOT NULL,
            url TEXT,
            nap_data TEXT DEFAULT '{}',
            status TEXT DEFAULT 'found',
            issues TEXT DEFAULT '[]',
            last_checked_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS portfolios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            urls TEXT DEFAULT '[]',
            settings TEXT DEFAULT '{}',
            health_score INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS report_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            widgets TEXT DEFAULT '[]',
            style TEXT DEFAULT '{}',
            is_builtin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS generated_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER,
            project_id INTEGER,
            title TEXT,
            data TEXT DEFAULT '{}',
            file_path TEXT,
            generated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config TEXT DEFAULT '{}',
            channels TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 1,
            last_triggered_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS alert_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id INTEGER NOT NULL,
            triggered_at TEXT NOT NULL,
            data TEXT DEFAULT '{}',
            channels_sent TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            details TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# Extended helper functions
# ---------------------------------------------------------------------------

def _jdumps(obj: Any) -> str:
    """JSON-serialize with sanitization."""
    return json.dumps(_sanitize_for_json(obj), default=str)


def write_tracked_keywords(conn: sqlite3.Connection, keywords: list[dict]) -> None:
    """Insert or ignore tracked keywords into tracked_keywords table."""
    init_extended_schema(conn)
    for kw in keywords:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO tracked_keywords
                   (project_id, keyword, location, device, language, tags)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    kw.get("project_id"),
                    kw.get("keyword", ""),
                    kw.get("location", "United States"),
                    kw.get("device", "desktop"),
                    kw.get("language", "en"),
                    _jdumps(kw.get("tags", [])),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_tracked_keywords(conn: sqlite3.Connection, project_id: Optional[int] = None) -> list:
    """Return list of active tracked keywords, optionally filtered by project_id."""
    init_extended_schema(conn)
    try:
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM tracked_keywords WHERE is_active=1 AND project_id=?",
                (project_id,),
            )
        else:
            cur = conn.execute("SELECT * FROM tracked_keywords WHERE is_active=1")
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_rank_history(conn: sqlite3.Connection, entries: list[dict]) -> None:
    """Insert or replace rank history entries."""
    init_extended_schema(conn)
    for e in entries:
        try:
            conn.execute(
                """INSERT OR REPLACE INTO rank_history
                   (tracked_keyword_id, date, position, previous_position, url, serp_features, visibility_score)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    e.get("tracked_keyword_id"),
                    e.get("date"),
                    e.get("position"),
                    e.get("previous_position"),
                    e.get("url", ""),
                    _jdumps(e.get("serp_features", [])),
                    e.get("visibility_score", 0),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_rank_history(
    conn: sqlite3.Connection, keyword_id: Optional[int] = None, days: int = 30
) -> list:
    """Return rank history for a keyword (or all keywords) over the last N days."""
    init_extended_schema(conn)
    try:
        if keyword_id is not None:
            cur = conn.execute(
                """SELECT * FROM rank_history
                   WHERE tracked_keyword_id=?
                     AND date >= date('now', ?)
                   ORDER BY date DESC""",
                (keyword_id, f"-{days} days"),
            )
        else:
            cur = conn.execute(
                """SELECT * FROM rank_history
                   WHERE date >= date('now', ?)
                   ORDER BY date DESC""",
                (f"-{days} days",),
            )
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_domain_profile(conn: sqlite3.Connection, data: dict) -> None:
    """Insert or replace a domain profile record."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT OR REPLACE INTO domain_profiles
               (domain, domain_rating, organic_traffic_est, organic_keywords_count,
                referring_domains_count, backlinks_count, traffic_value_est, data, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                data.get("domain", ""),
                data.get("domain_rating", 0),
                data.get("organic_traffic_est", 0),
                data.get("organic_keywords_count", 0),
                data.get("referring_domains_count", 0),
                data.get("backlinks_count", 0),
                data.get("traffic_value_est", 0),
                _jdumps(data.get("data", {})),
            ),
        )
        conn.commit()
    except Exception:
        pass


def read_domain_profile(conn: sqlite3.Connection, domain: str) -> dict:
    """Return domain profile dict for given domain, or empty dict."""
    init_extended_schema(conn)
    try:
        cur = conn.execute("SELECT * FROM domain_profiles WHERE domain=?", (domain,))
        row = cur.fetchone()
        if row:
            d = dict(row)
            try:
                d["data"] = json.loads(d.get("data") or "{}")
            except Exception:
                pass
            return d
    except Exception:
        pass
    return {}


def write_backlinks(conn: sqlite3.Connection, domain: str, backlinks: list[dict]) -> None:
    """Insert backlink records for a domain."""
    init_extended_schema(conn)
    for bl in backlinks:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO backlinks
                   (domain, source_url, target_url, anchor_text, link_type,
                    is_dofollow, domain_rating, first_seen, last_seen, is_broken)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    domain,
                    bl.get("source_url", ""),
                    bl.get("target_url", ""),
                    bl.get("anchor_text", ""),
                    bl.get("link_type", "text"),
                    int(bl.get("is_dofollow", 1)),
                    bl.get("domain_rating", 0),
                    bl.get("first_seen"),
                    bl.get("last_seen"),
                    int(bl.get("is_broken", 0)),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_backlinks(conn: sqlite3.Connection, domain: str) -> list:
    """Return all backlinks for a domain."""
    init_extended_schema(conn)
    try:
        cur = conn.execute("SELECT * FROM backlinks WHERE domain=?", (domain,))
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_organic_keywords(conn: sqlite3.Connection, domain: str, keywords: list[dict]) -> None:
    """Insert or replace organic keyword records for a domain."""
    init_extended_schema(conn)
    for kw in keywords:
        try:
            conn.execute(
                """INSERT OR REPLACE INTO organic_keywords
                   (domain, keyword, position, volume, traffic_est, url,
                    serp_features, difficulty, search_intent, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    domain,
                    kw.get("keyword", ""),
                    kw.get("position", 0),
                    kw.get("volume", 0),
                    kw.get("traffic_est", 0),
                    kw.get("url", ""),
                    _jdumps(kw.get("serp_features", [])),
                    kw.get("difficulty", 0),
                    kw.get("search_intent", "informational"),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_organic_keywords(conn: sqlite3.Connection, domain: str) -> list:
    """Return organic keywords for a domain."""
    init_extended_schema(conn)
    try:
        cur = conn.execute(
            "SELECT * FROM organic_keywords WHERE domain=? ORDER BY position ASC",
            (domain,),
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_gsc_data(conn: sqlite3.Connection, property_id: int, rows: list[dict]) -> None:
    """Insert GSC performance rows (ignore duplicates)."""
    init_extended_schema(conn)
    for row in rows:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO gsc_data
                   (property_id, date, query, page, clicks, impressions, ctr, position, device, country)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    property_id,
                    row.get("date", ""),
                    row.get("query", ""),
                    row.get("page", ""),
                    row.get("clicks", 0),
                    row.get("impressions", 0),
                    row.get("ctr", 0),
                    row.get("position", 0),
                    row.get("device", "web"),
                    row.get("country", ""),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_gsc_data(conn: sqlite3.Connection, property_id: int, days: int = 90) -> list:
    """Return GSC data for a property over the last N days."""
    init_extended_schema(conn)
    try:
        cur = conn.execute(
            """SELECT * FROM gsc_data
               WHERE property_id=?
                 AND date >= date('now', ?)
               ORDER BY date DESC""",
            (property_id, f"-{days} days"),
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_analytics_event(conn: sqlite3.Connection, event: dict) -> None:
    """Insert a single analytics event."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT INTO analytics_events
               (site_id, timestamp, page_url, referrer, user_agent, event_type,
                session_id, country, device, browser, is_bot, bot_name, custom_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.get("site_id", ""),
                event.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
                event.get("page_url", ""),
                event.get("referrer", ""),
                event.get("user_agent", ""),
                event.get("event_type", "pageview"),
                event.get("session_id", ""),
                event.get("country", ""),
                event.get("device", ""),
                event.get("browser", ""),
                int(event.get("is_bot", 0)),
                event.get("bot_name", ""),
                _jdumps(event.get("custom_data", {})),
            ),
        )
        conn.commit()
    except Exception:
        pass


def read_analytics_summary(conn: sqlite3.Connection, site_id: str, days: int = 30) -> dict:
    """Return aggregate analytics summary for a site over the last N days."""
    init_extended_schema(conn)
    try:
        cur = conn.execute(
            """SELECT
                COUNT(*) as total_events,
                SUM(CASE WHEN is_bot=0 THEN 1 ELSE 0 END) as human_events,
                SUM(CASE WHEN is_bot=1 THEN 1 ELSE 0 END) as bot_events,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(DISTINCT page_url) as unique_pages
               FROM analytics_events
               WHERE site_id=?
                 AND timestamp >= datetime('now', ?)
            """,
            (site_id, f"-{days} days"),
        )
        row = cur.fetchone()
        return dict(row) if row else {}
    except Exception:
        return {}


def write_brand_mentions(conn: sqlite3.Connection, mentions: list[dict]) -> None:
    """Insert brand mention records."""
    init_extended_schema(conn)
    for m in mentions:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO brand_mentions
                   (project_id, brand_name, source_url, date, context_text,
                    sentiment, mention_type, is_linked)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    m.get("project_id"),
                    m.get("brand_name", ""),
                    m.get("source_url", ""),
                    m.get("date"),
                    m.get("context_text", ""),
                    m.get("sentiment", "neutral"),
                    m.get("mention_type", "web"),
                    int(m.get("is_linked", 0)),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_brand_mentions(conn: sqlite3.Connection, project_id: Optional[int] = None) -> list:
    """Return brand mentions, optionally filtered by project_id."""
    init_extended_schema(conn)
    try:
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM brand_mentions WHERE project_id=? ORDER BY created_at DESC",
                (project_id,),
            )
        else:
            cur = conn.execute("SELECT * FROM brand_mentions ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_ai_citations(conn: sqlite3.Connection, citations: list[dict]) -> None:
    """Insert AI citation records."""
    init_extended_schema(conn)
    for c in citations:
        try:
            conn.execute(
                """INSERT INTO ai_citations
                   (project_id, brand_name, llm_platform, prompt, date,
                    brand_mentioned, url_cited, position, sentiment, response_text)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    c.get("project_id"),
                    c.get("brand_name", ""),
                    c.get("llm_platform", ""),
                    c.get("prompt", ""),
                    c.get("date"),
                    int(c.get("brand_mentioned", 0)),
                    c.get("url_cited", ""),
                    c.get("position", 0),
                    c.get("sentiment", "neutral"),
                    c.get("response_text", ""),
                ),
            )
        except Exception:
            pass
    conn.commit()


def read_ai_citations(conn: sqlite3.Connection, project_id: Optional[int] = None) -> list:
    """Return AI citation records, optionally filtered by project_id."""
    init_extended_schema(conn)
    try:
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM ai_citations WHERE project_id=? ORDER BY created_at DESC",
                (project_id,),
            )
        else:
            cur = conn.execute("SELECT * FROM ai_citations ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def write_portfolio(conn: sqlite3.Connection, portfolio: dict) -> int:
    """Insert a portfolio record and return its id."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT INTO portfolios (name, description, urls, settings, health_score)
               VALUES (?, ?, ?, ?, ?)""",
            (
                portfolio.get("name", ""),
                portfolio.get("description", ""),
                _jdumps(portfolio.get("urls", [])),
                _jdumps(portfolio.get("settings", {})),
                portfolio.get("health_score", 0),
            ),
        )
        conn.commit()
        cur = conn.execute("SELECT last_insert_rowid()")
        return int(cur.fetchone()[0])
    except Exception:
        return -1


def read_portfolios(conn: sqlite3.Connection) -> list:
    """Return all portfolios."""
    init_extended_schema(conn)
    try:
        cur = conn.execute("SELECT * FROM portfolios ORDER BY created_at DESC")
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            for field in ("urls", "settings"):
                try:
                    d[field] = json.loads(d.get(field) or "[]")
                except Exception:
                    pass
            rows.append(d)
        return rows
    except Exception:
        return []


def write_alert(conn: sqlite3.Connection, alert: dict) -> int:
    """Insert an alert record and return its id."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT INTO alerts (project_id, name, type, config, channels, is_active)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                alert.get("project_id"),
                alert.get("name", ""),
                alert.get("type", ""),
                _jdumps(alert.get("config", {})),
                _jdumps(alert.get("channels", {})),
                int(alert.get("is_active", 1)),
            ),
        )
        conn.commit()
        cur = conn.execute("SELECT last_insert_rowid()")
        return int(cur.fetchone()[0])
    except Exception:
        return -1


def read_alerts(conn: sqlite3.Connection, project_id: Optional[int] = None) -> list:
    """Return alerts, optionally filtered by project_id."""
    init_extended_schema(conn)
    try:
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM alerts WHERE is_active=1 AND project_id=?",
                (project_id,),
            )
        else:
            cur = conn.execute("SELECT * FROM alerts WHERE is_active=1")
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            for field in ("config", "channels"):
                try:
                    d[field] = json.loads(d.get(field) or "{}")
                except Exception:
                    pass
            rows.append(d)
        return rows
    except Exception:
        return []


def write_alert_history(conn: sqlite3.Connection, alert_id: int, data: dict) -> None:
    """Insert an alert history record."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT INTO alert_history (alert_id, triggered_at, data, channels_sent)
               VALUES (?, datetime('now'), ?, ?)""",
            (alert_id, _jdumps(data), _jdumps(data.get("channels_sent", []))),
        )
        conn.execute(
            "UPDATE alerts SET last_triggered_at=datetime('now') WHERE id=?",
            (alert_id,),
        )
        conn.commit()
    except Exception:
        pass


def read_alert_history(
    conn: sqlite3.Connection, alert_id: Optional[int] = None, days: int = 30
) -> list:
    """Return alert history, optionally filtered by alert_id, for the last N days."""
    init_extended_schema(conn)
    try:
        if alert_id is not None:
            cur = conn.execute(
                """SELECT * FROM alert_history
                   WHERE alert_id=? AND triggered_at >= datetime('now', ?)
                   ORDER BY triggered_at DESC""",
                (alert_id, f"-{days} days"),
            )
        else:
            cur = conn.execute(
                """SELECT * FROM alert_history
                   WHERE triggered_at >= datetime('now', ?)
                   ORDER BY triggered_at DESC""",
                (f"-{days} days",),
            )
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def read_app_settings(conn: sqlite3.Connection) -> dict:
    """Return all app settings as a key->value dict."""
    init_extended_schema(conn)
    try:
        cur = conn.execute("SELECT key, value FROM app_settings")
        return {r[0]: r[1] for r in cur.fetchall()}
    except Exception:
        return {}


def write_app_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Insert or replace a single app setting."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT OR REPLACE INTO app_settings (key, value, updated_at)
               VALUES (?, ?, datetime('now'))""",
            (key, value),
        )
        conn.commit()
    except Exception:
        pass


def write_audit_log(
    conn: sqlite3.Connection,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict,
) -> None:
    """Append an audit log entry."""
    init_extended_schema(conn)
    try:
        conn.execute(
            """INSERT INTO audit_log (action, resource_type, resource_id, details)
               VALUES (?, ?, ?, ?)""",
            (action, resource_type, resource_id, _jdumps(details)),
        )
        conn.commit()
    except Exception:
        pass


def read_audit_log(conn: sqlite3.Connection, limit: int = 100) -> list:
    """Return the most recent audit log entries."""
    init_extended_schema(conn)
    try:
        cur = conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []
