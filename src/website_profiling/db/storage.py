"""
SQLite data layer for WebsiteProfiling: single DB for crawl, edges, nodes, lighthouse, report payload.

All DB access should go through :func:`db_session` so one connection at a time per database path
(process-wide lock). That serializes writers like a single-slot queue and avoids lock/readonly issues
on slow or synced volumes.
"""
import json
import math
import os
import shutil
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

import pandas as pd


_db_path_locks: dict[str, threading.Lock] = {}
_db_path_locks_guard = threading.Lock()


def _normalize_db_path(db_path: str) -> str:
    return os.path.normcase(os.path.abspath(db_path))


def _lock_for_db_path(db_path: str) -> threading.Lock:
    key = _normalize_db_path(db_path)
    with _db_path_locks_guard:
        if key not in _db_path_locks:
            _db_path_locks[key] = threading.Lock()
        return _db_path_locks[key]


def _open_sqlite(db_path: str) -> sqlite3.Connection:
    """Open SQLite without taking the process-wide DB lock (internal; use :func:`db_session`)."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_session(db_path: str) -> Iterator[sqlite3.Connection]:
    """Serialize access to ``db_path``: one connection at a time, then close (mutex per absolute path)."""
    lock = _lock_for_db_path(db_path)
    lock.acquire()
    try:
        conn = _open_sqlite(db_path)
        try:
            yield conn
        finally:
            conn.close()
    finally:
        lock.release()


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
    Tables captured: report_payload, lighthouse_summary, lighthouse_runs, lighthouse_page_summaries,
    lh_audits, lh_audit_items.
    crawl_results / edges / nodes are intentionally excluded (they belong to the new crawl).
    Returns empty lists for all tables when the DB file does not exist.
    """
    tables = [
        "report_payload",
        "lighthouse_summary",
        "lighthouse_runs",
        "lighthouse_page_summaries",
        "lh_audits",
        "lh_audit_items",
    ]
    result: dict[str, list] = {t: [] for t in tables}
    p = Path(db_path)
    if not p.exists() or not p.is_file():
        return result
    try:
        with db_session(db_path) as conn:
            for table in tables:
                try:
                    cur = conn.execute(f"SELECT * FROM {table}")
                    result[table] = [dict(row) for row in cur.fetchall()]
                except Exception:
                    pass
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

    for row in data.get("lh_audits", []):
        try:
            conn.execute(
                """INSERT OR IGNORE INTO lh_audits (id, run_id, audit_id, category_id, score, score_display_mode,
                   title, description, display_value, numeric_value, help_text, details_type, details_headings, details_meta)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    row.get("id"),
                    row.get("run_id"),
                    row.get("audit_id"),
                    row.get("category_id"),
                    row.get("score"),
                    row.get("score_display_mode"),
                    row.get("title"),
                    row.get("description"),
                    row.get("display_value"),
                    row.get("numeric_value"),
                    row.get("help_text"),
                    row.get("details_type"),
                    row.get("details_headings"),
                    row.get("details_meta"),
                ),
            )
        except Exception:
            pass

    for row in data.get("lh_audit_items", []):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO lh_audit_items (id, audit_row_id, item_index, row_data) VALUES (?, ?, ?, ?)",
                (row.get("id"), row.get("audit_row_id"), row.get("item_index"), row.get("row_data")),
            )
        except Exception:
            pass

    conn.commit()


def ensure_db_recreated(db_path: str) -> None:
    """Delete existing DB file (and journal) so the next :func:`db_session` creates a fresh DB."""
    for p in (db_path, db_path + "-journal"):
        if Path(p).exists():
            try:
                Path(p).unlink()
            except OSError:
                pass


def get_connection(db_path: str) -> sqlite3.Connection:
    """Open SQLite (no lock). Prefer :func:`db_session` so access is serialized per DB path."""
    return _open_sqlite(db_path)


def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they do not exist. crawl_results is created by write_crawl from DataFrame."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS crawl_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            start_url TEXT
        );

        CREATE TABLE IF NOT EXISTS edges (
            crawl_run_id INTEGER NOT NULL,
            from_url TEXT NOT NULL,
            to_url TEXT NOT NULL,
            PRIMARY KEY (crawl_run_id, from_url, to_url)
        );

        CREATE TABLE IF NOT EXISTS nodes (
            crawl_run_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            count INTEGER NOT NULL,
            PRIMARY KEY (crawl_run_id, url)
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

        CREATE TABLE IF NOT EXISTS lh_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            audit_id TEXT NOT NULL,
            category_id TEXT,
            score REAL,
            score_display_mode TEXT,
            title TEXT,
            description TEXT,
            display_value TEXT,
            numeric_value REAL,
            help_text TEXT,
            details_type TEXT,
            details_headings TEXT,
            details_meta TEXT,
            FOREIGN KEY (run_id) REFERENCES lighthouse_runs(id)
        );
        CREATE INDEX IF NOT EXISTS idx_lh_audits_run_id ON lh_audits(run_id);
        CREATE INDEX IF NOT EXISTS idx_lh_audits_run_audit ON lh_audits(run_id, audit_id);
        CREATE INDEX IF NOT EXISTS idx_lh_audits_audit_id ON lh_audits(audit_id);

        CREATE TABLE IF NOT EXISTS lh_audit_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_row_id INTEGER NOT NULL,
            item_index INTEGER NOT NULL,
            row_data TEXT NOT NULL,
            FOREIGN KEY (audit_row_id) REFERENCES lh_audits(id)
        );
        CREATE INDEX IF NOT EXISTS idx_lh_audit_items_audit_row ON lh_audit_items(audit_row_id);
    """)
    conn.commit()


def _crawl_results_has_run_id(conn: sqlite3.Connection) -> bool:
    """True if crawl_results exists and includes crawl_run_id (append-by-run crawls)."""
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'")
        if cur.fetchone() is None:
            return False
        cur = conn.execute("PRAGMA table_info(crawl_results)")
        return any(row[1] == "crawl_run_id" for row in cur.fetchall())
    except Exception:
        return False


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
        df["crawl_run_id"] = crawl_run_id
        try:
            cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'")
            table_exists = cur.fetchone() is not None
            if not table_exists or not _crawl_results_has_run_id(conn):
                if table_exists:
                    conn.execute("DROP TABLE crawl_results")
                    conn.commit()
                cols = ["crawl_run_id"] + [c for c in df.columns if c != "crawl_run_id"]
                df[cols].to_sql("crawl_results", conn, index=False, if_exists="replace")
            else:
                df.to_sql("crawl_results", conn, index=False, if_exists="append", method="multi")
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
            elif _crawl_results_has_run_id(conn):
                df = pd.read_sql("SELECT * FROM crawl_results WHERE crawl_run_id = ?", conn, params=(run_id,))
            else:
                df = pd.read_sql("SELECT * FROM crawl_results", conn)
        else:
            if _crawl_results_has_run_id(conn):
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
    """Write edges. If crawl_run_id is set, insert for that run; else replace edges for the latest crawl run."""
    if crawl_run_id is None:
        conn.execute("DELETE FROM edges")
        if edges:
            rid = get_latest_crawl_run_id(conn)
            if rid is not None:
                conn.executemany(
                    "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (?, ?, ?)",
                    [(rid, a.rstrip("/"), b.rstrip("/")) for a, b in edges],
                )
        conn.commit()
        return
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
        if run_id is None:
            return []
        cur = conn.execute("SELECT from_url, to_url FROM edges WHERE crawl_run_id = ?", (run_id,))
        return [tuple(row) for row in cur.fetchall()]
    except Exception:
        return []


def write_nodes(conn: sqlite3.Connection, df: pd.DataFrame, crawl_run_id: Optional[int] = None) -> None:
    """Write nodes. If crawl_run_id is set, insert for that run; else replace (legacy)."""
    if df.empty:
        if crawl_run_id is None:
            conn.execute("DELETE FROM nodes")
        else:
            conn.execute("DELETE FROM nodes WHERE crawl_run_id = ?", (crawl_run_id,))
        conn.commit()
        return
    ndf = df.copy()
    if "index" in ndf.columns and "url" not in ndf.columns:
        ndf = ndf.rename(columns={"index": "url"})
    if "url" not in ndf.columns or "count" not in ndf.columns:
        return
    if crawl_run_id is None:
        rid = get_latest_crawl_run_id(conn)
        if rid is None:
            conn.execute("DELETE FROM nodes")
            conn.commit()
            return
        conn.execute("DELETE FROM nodes WHERE crawl_run_id = ?", (rid,))
        ndf["crawl_run_id"] = rid
        ndf[["crawl_run_id", "url", "count"]].to_sql("nodes", conn, index=False, if_exists="append", method="multi")
        conn.commit()
        return
    conn.execute("DELETE FROM nodes WHERE crawl_run_id = ?", (crawl_run_id,))
    ndf["crawl_run_id"] = crawl_run_id
    ndf[["crawl_run_id", "url", "count"]].to_sql("nodes", conn, index=False, if_exists="append", method="multi")
    conn.commit()


def read_nodes(conn: sqlite3.Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    """Read nodes. If run_id is None, use latest crawl run."""
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is None:
            return pd.DataFrame(columns=["url", "count"])
        return pd.read_sql("SELECT url, count FROM nodes WHERE crawl_run_id = ?", conn, params=(run_id,))
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
) -> int:
    """Append one raw Lighthouse run report (full JSON) to lighthouse_runs. Returns new row id."""
    conn.execute(
        "INSERT INTO lighthouse_runs (created_at, url, strategy, run_index, data) VALUES (?, ?, ?, ?, ?)",
        (time.strftime("%Y-%m-%d %H:%M:%S"), url, strategy, run_index, json.dumps(_sanitize_for_json(data), default=str)),
    )
    conn.commit()
    cur = conn.execute("SELECT last_insert_rowid()")
    return int(cur.fetchone()[0])


def write_lh_audits_from_run(conn: sqlite3.Connection, run_id: int, lhr_data: dict[str, Any]) -> None:
    """Parse LHR and insert lh_audits + lh_audit_items for the given lighthouse_runs.id."""
    from ..lighthouse.schema import lhr_to_audit_rows

    audit_rows, item_refs = lhr_to_audit_rows(lhr_data)
    id_map: list[int] = []
    for row in audit_rows:
        conn.execute(
            """INSERT INTO lh_audits (run_id, audit_id, category_id, score, score_display_mode,
               title, description, display_value, numeric_value, help_text, details_type, details_headings, details_meta)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id,
                row["audit_id"],
                row["category_id"],
                row["score"],
                row["score_display_mode"],
                row["title"],
                row["description"],
                row["display_value"],
                row["numeric_value"],
                row["help_text"],
                row["details_type"],
                row["details_headings"],
                row["details_meta"],
            ),
        )
        id_map.append(int(conn.execute("SELECT last_insert_rowid()").fetchone()[0]))
    for audit_idx, item_index, rd in item_refs:
        audit_row_id = id_map[audit_idx]
        conn.execute(
            "INSERT INTO lh_audit_items (audit_row_id, item_index, row_data) VALUES (?,?,?)",
            (audit_row_id, item_index, json.dumps(_sanitize_for_json(rd), default=str)),
        )
    conn.commit()


def read_lh_runs_by_url(conn: sqlite3.Connection) -> dict[str, list[int]]:
    """Map url -> ordered list of lighthouse_runs.id (ascending by id)."""
    out: dict[str, list[int]] = {}
    try:
        cur = conn.execute("SELECT id, url FROM lighthouse_runs ORDER BY id")
        for row in cur.fetchall():
            u = str(row[1]).strip().rstrip("/")
            out.setdefault(u, []).append(int(row[0]))
    except Exception:
        pass
    return out


def read_lighthouse_run_json(conn: sqlite3.Connection, run_id: int) -> Optional[dict[str, Any]]:
    """Return parsed LHR JSON for a lighthouse_runs row, or None."""
    try:
        cur = conn.execute("SELECT data FROM lighthouse_runs WHERE id = ?", (run_id,))
        row = cur.fetchone()
        if row is None:
            return None
        return json.loads(row[0])
    except Exception:
        return None


def read_lh_audits_with_items(conn: sqlite3.Connection, run_id: int) -> list[dict[str, Any]]:
    """Return audits in Lighthouse-like shape: id, title, score, details.items, etc."""
    out: list[dict[str, Any]] = []
    try:
        cur = conn.execute(
            "SELECT * FROM lh_audits WHERE run_id = ? ORDER BY id",
            (run_id,),
        )
        for row in cur.fetchall():
            d = dict(row)
            aid = d.get("audit_id") or ""
            headings = None
            if d.get("details_headings"):
                try:
                    headings = json.loads(d["details_headings"])
                except (TypeError, json.JSONDecodeError):
                    headings = None
            meta: dict[str, Any] = {}
            if d.get("details_meta"):
                try:
                    raw_meta = json.loads(d["details_meta"])
                    if isinstance(raw_meta, dict):
                        meta = raw_meta
                except (TypeError, json.JSONDecodeError):
                    meta = {}

            cur_items = conn.execute(
                "SELECT row_data FROM lh_audit_items WHERE audit_row_id = ? ORDER BY item_index",
                (d["id"],),
            )
            items: list[Any] = []
            for (rd,) in cur_items.fetchall():
                try:
                    items.append(json.loads(rd))
                except (TypeError, json.JSONDecodeError):
                    items.append({})

            details: dict[str, Any] = dict(meta)
            if d.get("details_type"):
                details["type"] = d["details_type"]
            if headings is not None:
                details["headings"] = headings
            if items:
                details["items"] = items

            audit_obj: dict[str, Any] = {
                "id": aid,
                "category_id": d.get("category_id"),
                "title": d.get("title"),
                "description": d.get("description"),
                "score": d.get("score"),
                "scoreDisplayMode": d.get("score_display_mode"),
                "displayValue": d.get("display_value"),
                "numericValue": d.get("numeric_value"),
                "helpText": d.get("help_text"),
            }
            if details:
                audit_obj["details"] = details
            out.append(audit_obj)
    except Exception:
        pass
    return out


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
