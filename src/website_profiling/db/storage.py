"""
PostgreSQL data layer for WebsiteProfiling: crawl, edges, nodes, lighthouse, report payload.

All DB access should go through :func:`db_session`. Schema is managed by Alembic (``alembic upgrade head``).
Requires ``DATABASE_URL`` in the environment.
"""
from __future__ import annotations

import atexit
import json
import math
import os
import subprocess
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

import pandas as pd
import psycopg
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

from urllib.parse import urlparse

_pool: ConnectionPool | None = None
_shutdown_registered = False

_BOOL_COLS = ("viewport_present", "noindex", "has_schema")
_CRAWL_BATCH_SIZE = 1000


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def get_database_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. Example: postgres://user:pass@localhost:5432/website_profiling"
        )
    return url


def get_data_dir() -> str:
    return (os.environ.get("DATA_DIR") or os.getcwd()).strip() or os.getcwd()


def close_db_pool() -> None:
    """Close the process-wide connection pool (idempotent, safe to call multiple times)."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _register_pool_shutdown() -> None:
    global _shutdown_registered
    if not _shutdown_registered:
        atexit.register(close_db_pool)
        _shutdown_registered = True


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=get_database_url(),
            min_size=_env_int("DB_POOL_MIN", 2),
            max_size=_env_int("DB_POOL_MAX", 20),
            open=True,
            kwargs={"row_factory": dict_row},
        )
        _register_pool_shutdown()
    return _pool


@contextmanager
def db_session() -> Iterator[Connection]:
    """Yield a PostgreSQL connection from the process pool."""
    with _get_pool().connection() as conn:
        yield conn


def init_schema(conn: Connection | None = None) -> None:
    """No-op at runtime; schema is applied via Alembic migrations."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _json_val(obj: Any) -> Json:
    return Json(_sanitize_for_json(obj))


def _parse_json_field(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return val
    return val


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively replace NaN/Inf and numpy types so JSON is valid."""
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
    if hasattr(obj, "item"):
        try:
            return _sanitize_for_json(obj.item())
        except (ValueError, AttributeError):
            return None
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return obj


def _executemany(conn: Connection, sql: str, params: list, *, page_size: int = 500) -> None:
    if not params:
        return
    with conn.cursor() as cur:
        for i in range(0, len(params), page_size):
            cur.executemany(sql, params[i : i + page_size])


def backup_db_if_exists(skip_in_ci: bool = True) -> Optional[str]:
    """Run pg_dump to DATA_DIR/backups/ and return the dump path, or None."""
    if skip_in_ci and (
        os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("CI") == "true"
    ):
        return None
    data_dir = Path(get_data_dir())
    backup_dir = data_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    suffix = time.strftime("%Y%m%d-%H%M%S")
    out_path = backup_dir / f"website_profiling-{suffix}.dump"
    try:
        subprocess.run(
            [
                "pg_dump",
                "-Fc",
                "-f",
                str(out_path),
                get_database_url(),
            ],
            check=True,
            capture_output=True,
            timeout=300,
        )
        return str(out_path)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None


def read_historical_data() -> dict[str, list]:
    """Read historical tables before a crawl overwrite (excludes crawl_results/edges/nodes)."""
    tables = [
        "report_payload",
        "lighthouse_summary",
        "lighthouse_runs",
        "lighthouse_page_summaries",
        "lh_audits",
        "lh_audit_items",
        "google_data",
        "keyword_data",
        "keyword_history",
        "keyword_suggest_cache",
        "crawl_runs",
    ]
    result: dict[str, list] = {t: [] for t in tables}
    try:
        with db_session() as conn:
            for table in tables:
                try:
                    with conn.cursor() as cur:
                        cur.execute(f"SELECT * FROM {table}")
                        result[table] = [dict(row) for row in cur.fetchall()]
                except Exception:
                    pass
    except Exception:
        pass
    return result


def restore_historical_data(conn: Connection, data: dict[str, list]) -> None:
    """Insert previously-read historical rows (preserves explicit ids where provided)."""

    def _bulk(
        sql: str,
        rows: list[dict],
        keys: list[str],
        transform: Any | None = None,
    ) -> None:
        if not rows:
            return
        params: list[tuple] = []
        for row in rows:
            vals = []
            for k in keys:
                v = row.get(k)
                if transform and k in transform:
                    v = transform[k](v)
                vals.append(v)
            params.append(tuple(vals))
        try:
            _executemany(conn, sql, params, page_size=500)
        except Exception:
            for p in params:
                try:
                    conn.execute(sql, p)
                except Exception:
                    pass

    json_t = lambda v: _json_val(_parse_json_field(v))

    _bulk(
        """INSERT INTO report_payload (id, generated_at, site_name, canonical_domain, data)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("report_payload", []),
        ["id", "generated_at", "site_name", "canonical_domain", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO lighthouse_summary (id, created_at, data)
           VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("lighthouse_summary", []),
        ["id", "created_at", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO lighthouse_runs (id, created_at, url, strategy, run_index, data)
           VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("lighthouse_runs", []),
        ["id", "created_at", "url", "strategy", "run_index", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO lighthouse_page_summaries (url, created_at, data)
           VALUES (%s, %s, %s) ON CONFLICT (url) DO NOTHING""",
        data.get("lighthouse_page_summaries", []),
        ["url", "created_at", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO lh_audits (id, run_id, audit_id, category_id, score, score_display_mode,
           title, description, display_value, numeric_value, help_text, details_type,
           details_headings, details_meta)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
        data.get("lh_audits", []),
        [
            "id", "run_id", "audit_id", "category_id", "score", "score_display_mode",
            "title", "description", "display_value", "numeric_value", "help_text",
            "details_type", "details_headings", "details_meta",
        ],
        {"details_headings": json_t, "details_meta": json_t},
    )
    _bulk(
        """INSERT INTO lh_audit_items (id, audit_row_id, item_index, row_data)
           VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("lh_audit_items", []),
        ["id", "audit_row_id", "item_index", "row_data"],
        {"row_data": json_t},
    )
    _bulk(
        """INSERT INTO google_data (id, fetched_at, data)
           VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("google_data", []),
        ["id", "fetched_at", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO keyword_data (id, fetched_at, data)
           VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("keyword_data", []),
        ["id", "fetched_at", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO keyword_history
           (id, keyword, fetched_at, position, clicks, impressions, ctr)
           VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("keyword_history", []),
        ["id", "keyword", "fetched_at", "position", "clicks", "impressions", "ctr"],
    )
    _bulk(
        """INSERT INTO keyword_suggest_cache (cache_key, fetched_at, data)
           VALUES (%s, %s, %s) ON CONFLICT (cache_key) DO NOTHING""",
        data.get("keyword_suggest_cache", []),
        ["cache_key", "fetched_at", "data"],
        {"data": json_t},
    )
    _bulk(
        """INSERT INTO crawl_runs (id, created_at, start_url)
           VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("crawl_runs", []),
        ["id", "created_at", "start_url"],
    )

    conn.commit()


def ensure_crawl_tables_cleared(conn: Connection) -> None:
    """Clear crawl-scoped tables before a non-append crawl (preserves reports, Google, etc.)."""
    conn.execute("TRUNCATE crawl_results, edges, nodes RESTART IDENTITY CASCADE")
    conn.commit()


def read_pipeline_config(conn: Connection) -> tuple[dict[str, str], list[dict[str, str]]]:
    try:
        cur = conn.execute("SELECT key, value, is_unknown FROM pipeline_config ORDER BY key")
        rows = cur.fetchall()
        known: dict[str, str] = {}
        unknown: list[dict[str, str]] = []
        for row in rows:
            k, v = str(row["key"]), str(row["value"])
            if row["is_unknown"]:
                unknown.append({"key": k, "value": v})
            else:
                known[k] = v
        return known, unknown
    except Exception:
        return {}, []


def write_pipeline_config(
    conn: Connection,
    entries: dict[str, str],
    unknown_keys: list[dict[str, str]] | None = None,
) -> None:
    now = _now_iso()
    if unknown_keys is None:
        unknown_keys = []
    with conn.transaction():
        conn.execute("DELETE FROM pipeline_config")
        for k, v in entries.items():
            conn.execute(
                "INSERT INTO pipeline_config (key, value, is_unknown, updated_at) VALUES (%s, %s, false, %s)",
                (str(k), str(v), now),
            )
        for item in unknown_keys:
            conn.execute(
                """INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
                   VALUES (%s, %s, true, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_unknown = true, updated_at = EXCLUDED.updated_at""",
                (str(item["key"]), str(item.get("value", "")), now),
            )


def read_llm_config(conn: Connection) -> dict[str, str]:
    try:
        cur = conn.execute("SELECT key, value FROM llm_config ORDER BY key")
        return {str(row["key"]): str(row["value"]) for row in cur.fetchall()}
    except Exception:
        return {}


def write_llm_config(conn: Connection, entries: dict[str, str], secret_keys: set[str] | None = None) -> None:
    now = _now_iso()
    secret_keys = secret_keys or set()
    with conn.transaction():
        conn.execute("DELETE FROM llm_config")
        for k, v in entries.items():
            conn.execute(
                "INSERT INTO llm_config (key, value, is_secret, updated_at) VALUES (%s, %s, %s, %s)",
                (str(k), str(v), k in secret_keys, now),
            )


def read_llm_cache(conn: Connection, cache_key: str) -> Optional[str]:
    try:
        cur = conn.execute("SELECT response_json FROM llm_cache WHERE cache_key = %s", (cache_key,))
        row = cur.fetchone()
        if not row:
            return None
        val = row["response_json"]
        return json.dumps(val) if isinstance(val, (dict, list)) else str(val)
    except Exception:
        return None


def write_llm_cache(conn: Connection, cache_key: str, response_json: str) -> None:
    now = _now_iso()
    try:
        payload = json.loads(response_json)
    except json.JSONDecodeError:
        payload = response_json
    conn.execute(
        """INSERT INTO llm_cache (cache_key, response_json, created_at)
           VALUES (%s, %s, %s)
           ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, created_at = EXCLUDED.created_at""",
        (cache_key, _json_val(payload), now),
    )
    conn.commit()


def create_crawl_run(conn: Connection, start_url: Optional[str] = None) -> int:
    cur = conn.execute(
        "INSERT INTO crawl_runs (created_at, start_url) VALUES (%s, %s) RETURNING id",
        (_now_iso(), start_url),
    )
    row = cur.fetchone()
    conn.commit()
    return int(row["id"])


def get_latest_crawl_run_id(conn: Connection) -> Optional[int]:
    try:
        cur = conn.execute("SELECT id FROM crawl_runs ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        return int(row["id"]) if row else None
    except Exception:
        return None


def get_crawl_run_info(conn: Connection, run_id: int) -> Optional[dict[str, Any]]:
    try:
        cur = conn.execute("SELECT created_at, start_url FROM crawl_runs WHERE id = %s", (run_id,))
        row = cur.fetchone()
        if row is None:
            return None
        return {"created_at": row["created_at"], "start_url": row["start_url"]}
    except Exception:
        return None


def _df_row_to_crawl_json(row: pd.Series) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in row.index:
        if col in ("url", "crawl_run_id"):
            continue
        val = row[col]
        if pd.isna(val):
            out[col] = None
        elif hasattr(val, "item"):
            out[col] = _sanitize_for_json(val.item())
        else:
            out[col] = _sanitize_for_json(val)
    return out


def _extract_hostname(url: str) -> str:
    try:
        host = urlparse(str(url or "")).hostname
        return host.lower() if host else ""
    except Exception:
        return ""


def _canonical_domain_from_report(conn: Connection, report_data: dict[str, Any]) -> str:
    run_id = report_data.get("crawl_run_id")
    start_url = ""
    if run_id is not None:
        info = get_crawl_run_info(conn, int(run_id))
        if info:
            start_url = str(info.get("start_url") or "")
    top_pages = report_data.get("top_pages") or []
    fallback_url = ""
    if top_pages and isinstance(top_pages[0], dict):
        fallback_url = str(top_pages[0].get("url") or "")
    if not fallback_url:
        links = report_data.get("links") or []
        if links and isinstance(links[0], dict):
            fallback_url = str(links[0].get("url") or "")
    return _extract_hostname(start_url) or _extract_hostname(fallback_url)


_CRAWL_INSERT_SQL = """INSERT INTO crawl_results (crawl_run_id, url, status, title, data)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (crawl_run_id, url) DO UPDATE SET
  status = EXCLUDED.status,
  title = EXCLUDED.title,
  data = EXCLUDED.data"""


def _crawl_rows_from_df(df: pd.DataFrame, crawl_run_id: int) -> list[tuple]:
    rows: list[tuple] = []
    if df.empty or "url" not in df.columns:
        return rows
    data_cols = [c for c in df.columns if c not in ("url", "crawl_run_id")]
    for rec in df.to_dict(orient="records"):
        url = str(rec.get("url", "")).rstrip("/")
        if not url:
            continue
        payload = {c: _sanitize_for_json(rec[c]) if not pd.isna(rec.get(c)) else None for c in data_cols}
        status = str(rec.get("status") or "") if "status" in rec else None
        title = str(rec.get("title") or "") if "title" in rec else None
        rows.append((crawl_run_id, url, status, title, _json_val(payload)))
    return rows


def write_crawl_batch(
    conn: Connection,
    rows: list[tuple],
    crawl_run_id: int,
    *,
    commit: bool = True,
) -> None:
    """Insert a batch of crawl rows (each tuple: run_id, url, status, title, data Json)."""
    if not rows:
        return
    _executemany(conn, _CRAWL_INSERT_SQL, rows, page_size=_CRAWL_BATCH_SIZE)
    if commit:
        conn.commit()


def write_crawl(conn: Connection, df: pd.DataFrame, crawl_run_id: Optional[int] = None) -> None:
    if df.empty:
        if crawl_run_id is None:
            try:
                conn.execute("DELETE FROM crawl_results")
                conn.commit()
            except Exception:
                pass
        return

    df = df.copy()
    if "url" in df.columns:
        df["url"] = df["url"].astype(str).str.rstrip("/")

    with conn.transaction():
        if crawl_run_id is not None:
            conn.execute("DELETE FROM crawl_results WHERE crawl_run_id = %s", (crawl_run_id,))
            target_run_id = crawl_run_id
        else:
            conn.execute("DELETE FROM crawl_results")
            rid = get_latest_crawl_run_id(conn)
            if rid is None:
                cur = conn.execute(
                    "INSERT INTO crawl_runs (created_at, start_url) VALUES (%s, %s) RETURNING id",
                    (_now_iso(), None),
                )
                rid = int(cur.fetchone()["id"])
            target_run_id = rid

        rows = _crawl_rows_from_df(df, target_run_id)
        if rows:
            _executemany(conn, _CRAWL_INSERT_SQL, rows, page_size=_CRAWL_BATCH_SIZE)


def read_crawl(conn: Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is None:
            cur = conn.execute("SELECT url, data FROM crawl_results")
        else:
            cur = conn.execute(
                "SELECT url, data FROM crawl_results WHERE crawl_run_id = %s",
                (run_id,),
            )
        rows = cur.fetchall()
        if not rows:
            return pd.DataFrame()
        records = []
        for row in rows:
            rec = {"url": row["url"]}
            data = _parse_json_field(row["data"]) or {}
            if isinstance(data, dict):
                rec.update(data)
            records.append(rec)
        df = pd.DataFrame(records)
        for c in _BOOL_COLS:
            if c in df.columns:
                df[c] = df[c].astype(bool)
        return df
    except Exception:
        return pd.DataFrame()


def write_edges(conn: Connection, edges: list[tuple[str, str]], crawl_run_id: Optional[int] = None) -> None:
    if crawl_run_id is None:
        conn.execute("DELETE FROM edges")
        if edges:
            rid = get_latest_crawl_run_id(conn)
            if rid is not None:
                _executemany(
                    conn,
                    "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    [(rid, a.rstrip("/"), b.rstrip("/")) for a, b in edges],
                )
        conn.commit()
        return
    conn.execute("DELETE FROM edges WHERE crawl_run_id = %s", (crawl_run_id,))
    if edges:
        _executemany(
            conn,
            "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            [(crawl_run_id, a.rstrip("/"), b.rstrip("/")) for a, b in edges],
        )
    conn.commit()


def read_edges(conn: Connection, run_id: Optional[int] = None) -> list[tuple[str, str]]:
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is None:
            return []
        cur = conn.execute(
            "SELECT from_url, to_url FROM edges WHERE crawl_run_id = %s",
            (run_id,),
        )
        return [(row["from_url"], row["to_url"]) for row in cur.fetchall()]
    except Exception:
        return []


def write_nodes(conn: Connection, df: pd.DataFrame, crawl_run_id: Optional[int] = None) -> None:
    if df.empty:
        if crawl_run_id is None:
            conn.execute("DELETE FROM nodes")
        else:
            conn.execute("DELETE FROM nodes WHERE crawl_run_id = %s", (crawl_run_id,))
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
        crawl_run_id = rid
    conn.execute("DELETE FROM nodes WHERE crawl_run_id = %s", (crawl_run_id,))
    _executemany(
        conn,
        "INSERT INTO nodes (crawl_run_id, url, count) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
        [
            (crawl_run_id, str(r["url"]), int(r["count"]))
            for _, r in ndf.iterrows()
        ],
    )
    conn.commit()


def read_nodes(conn: Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    try:
        if run_id is None:
            run_id = get_latest_crawl_run_id(conn)
        if run_id is None:
            return pd.DataFrame(columns=["url", "count"])
        cur = conn.execute(
            "SELECT url, count FROM nodes WHERE crawl_run_id = %s",
            (run_id,),
        )
        rows = cur.fetchall()
        if not rows:
            return pd.DataFrame(columns=["url", "count"])
        return pd.DataFrame(rows)
    except Exception:
        return pd.DataFrame(columns=["url", "count"])


def write_lighthouse_summary(conn: Connection, summary: dict[str, Any]) -> None:
    conn.execute(
        "INSERT INTO lighthouse_summary (created_at, data) VALUES (%s, %s)",
        (_now_iso(), _json_val(summary)),
    )
    conn.commit()


def read_lighthouse_summary(conn: Connection) -> Optional[dict[str, Any]]:
    try:
        cur = conn.execute("SELECT data FROM lighthouse_summary ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def write_lighthouse_run(
    conn: Connection,
    url: str,
    strategy: str,
    run_index: int,
    data: dict[str, Any],
) -> int:
    cur = conn.execute(
        """INSERT INTO lighthouse_runs (created_at, url, strategy, run_index, data)
           VALUES (%s, %s, %s, %s, %s) RETURNING id""",
        (_now_iso(), url, strategy, run_index, _json_val(data)),
    )
    row = cur.fetchone()
    conn.commit()
    return int(row["id"])


def write_lh_audits_from_run(conn: Connection, run_id: int, lhr_data: dict[str, Any]) -> None:
    from ..lighthouse.schema import lhr_to_audit_rows

    audit_rows, item_refs = lhr_to_audit_rows(lhr_data)
    if not audit_rows:
        return

    def _headings_val(row: dict) -> Any:
        h = row.get("details_headings")
        if isinstance(h, str) and h:
            return _json_val(json.loads(h))
        return _json_val(h)

    def _meta_val(row: dict) -> Any:
        m = row.get("details_meta")
        if isinstance(m, str) and m:
            return _json_val(json.loads(m))
        return _json_val(m)

    audit_params = [
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
            _headings_val(row),
            _meta_val(row),
        )
        for row in audit_rows
    ]

    with conn.transaction():
        _executemany(
            conn,
            """INSERT INTO lh_audits (run_id, audit_id, category_id, score, score_display_mode,
               title, description, display_value, numeric_value, help_text, details_type,
               details_headings, details_meta)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            audit_params,
            page_size=200,
        )
        cur = conn.execute(
            "SELECT id FROM lh_audits WHERE run_id = %s ORDER BY id",
            (run_id,),
        )
        id_map = [int(r["id"]) for r in cur.fetchall()]
        if len(id_map) != len(audit_rows):
            return
        item_params = [
            (id_map[audit_idx], item_index, _json_val(rd))
            for audit_idx, item_index, rd in item_refs
        ]
        if item_params:
            _executemany(
                conn,
                "INSERT INTO lh_audit_items (audit_row_id, item_index, row_data) VALUES (%s, %s, %s)",
                item_params,
                page_size=500,
            )


def read_lh_runs_by_url(conn: Connection) -> dict[str, list[int]]:
    out: dict[str, list[int]] = {}
    try:
        cur = conn.execute("SELECT id, url FROM lighthouse_runs ORDER BY id")
        for row in cur.fetchall():
            u = str(row["url"]).strip().rstrip("/")
            out.setdefault(u, []).append(int(row["id"]))
    except Exception:
        pass
    return out


def read_lighthouse_run_json(conn: Connection, run_id: int) -> Optional[dict[str, Any]]:
    try:
        cur = conn.execute("SELECT data FROM lighthouse_runs WHERE id = %s", (run_id,))
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_latest_lighthouse_run_json(conn: Connection) -> Optional[dict[str, Any]]:
    """Return full Lighthouse JSON for the most recent lighthouse_runs row."""
    try:
        cur = conn.execute("SELECT data FROM lighthouse_runs ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_lh_audits_with_items(conn: Connection, run_id: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        cur = conn.execute("SELECT * FROM lh_audits WHERE run_id = %s ORDER BY id", (run_id,))
        for d in cur.fetchall():
            aid = d.get("audit_id") or ""
            headings = _parse_json_field(d.get("details_headings"))
            meta = _parse_json_field(d.get("details_meta")) or {}
            if not isinstance(meta, dict):
                meta = {}

            cur_items = conn.execute(
                "SELECT row_data FROM lh_audit_items WHERE audit_row_id = %s ORDER BY item_index",
                (d["id"],),
            )
            items: list[Any] = []
            for item_row in cur_items.fetchall():
                rd = _parse_json_field(item_row["row_data"])
                items.append(rd if isinstance(rd, dict) else {})

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


def write_lighthouse_page_summary(conn: Connection, url: str, summary: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO lighthouse_page_summaries (url, created_at, data)
           VALUES (%s, %s, %s)
           ON CONFLICT (url) DO UPDATE SET created_at = EXCLUDED.created_at, data = EXCLUDED.data""",
        (url, _now_iso(), _json_val(summary)),
    )
    conn.commit()


def read_lighthouse_page_summaries(conn: Connection) -> dict[str, Any]:
    out: dict[str, Any] = {}
    try:
        cur = conn.execute("SELECT url, data FROM lighthouse_page_summaries")
        for row in cur.fetchall():
            data = _parse_json_field(row["data"])
            if isinstance(data, dict):
                out[str(row["url"])] = data
    except Exception:
        pass
    return out


def read_llm_cache_batch(conn: Connection, cache_keys: list[str]) -> dict[str, dict[str, Any]]:
    if not cache_keys:
        return {}
    out: dict[str, dict[str, Any]] = {}
    try:
        cur = conn.execute(
            "SELECT cache_key, response_json FROM llm_cache WHERE cache_key = ANY(%s)",
            (cache_keys,),
        )
        for row in cur.fetchall():
            key = str(row["cache_key"])
            val = row["response_json"]
            if isinstance(val, dict):
                out[key] = val
            elif isinstance(val, str):
                try:
                    out[key] = json.loads(val)
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass
    return out


def write_report_payload(conn: Connection, report_data: dict[str, Any]) -> None:
    site_name = str(report_data.get("site_name") or "")
    canonical_domain = _canonical_domain_from_report(conn, report_data)
    conn.execute(
        """INSERT INTO report_payload (generated_at, site_name, canonical_domain, data)
           VALUES (%s, %s, %s, %s)""",
        (_now_iso(), site_name, canonical_domain, _json_val(report_data)),
    )
    conn.commit()


def read_report_payload(conn: Connection) -> Optional[dict[str, Any]]:
    try:
        cur = conn.execute("SELECT data FROM report_payload ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        return data if isinstance(data, dict) else None
    except Exception:
        return None
