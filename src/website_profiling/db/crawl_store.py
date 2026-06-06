"""Crawl runs, results, edges, and nodes."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from psycopg import Connection
from urllib.parse import urlparse

from ._common import (
    _executemany,
    _json_val,
    _now_iso,
    _parse_json_field,
    _parse_row_json,
    _sanitize_for_json,
)
from .pool import db_session, get_data_dir, get_database_url

_BOOL_COLS = ("viewport_present", "noindex", "has_schema")
_CRAWL_BATCH_SIZE = 1000

def create_crawl_run(
    conn: Connection,
    start_url: Optional[str] = None,
    property_id: Optional[int] = None,
    render_mode: Optional[str] = None,
) -> int:
    mode = (render_mode or "static").strip().lower()
    try:
        cur = conn.execute(
            "INSERT INTO crawl_runs (created_at, start_url, property_id, render_mode) VALUES (%s, %s, %s, %s) RETURNING id",
            (_now_iso(), start_url, property_id, mode),
        )
    except Exception:
        cur = conn.execute(
            "INSERT INTO crawl_runs (created_at, start_url, property_id) VALUES (%s, %s, %s) RETURNING id",
            (_now_iso(), start_url, property_id),
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
        cur = conn.execute(
            "SELECT created_at, start_url, render_mode FROM crawl_runs WHERE id = %s",
            (run_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        out: dict[str, Any] = {
            "created_at": row["created_at"],
            "start_url": row["start_url"],
        }
        if "render_mode" in row.keys():
            out["render_mode"] = row["render_mode"]
        return out
    except Exception:
        try:
            cur = conn.execute(
                "SELECT created_at, start_url FROM crawl_runs WHERE id = %s",
                (run_id,),
            )
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


_CRAWL_INSERT_SQL = """INSERT INTO crawl_results (crawl_run_id, url, status, title, fetch_method, data)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (crawl_run_id, url) DO UPDATE SET
  status = EXCLUDED.status,
  title = EXCLUDED.title,
  fetch_method = EXCLUDED.fetch_method,
  data = EXCLUDED.data"""

_CRAWL_INSERT_SQL_LEGACY = """INSERT INTO crawl_results (crawl_run_id, url, status, title, data)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (crawl_run_id, url) DO UPDATE SET
  status = EXCLUDED.status,
  title = EXCLUDED.title,
  data = EXCLUDED.data"""


def _crawl_rows_from_df(df: pd.DataFrame, crawl_run_id: int) -> list[tuple]:
    rows: list[tuple] = []
    if df.empty or "url" not in df.columns:
        return rows
    data_cols = [
        c for c in df.columns if c not in ("url", "crawl_run_id", "fetch_method")
    ]
    for rec in df.to_dict(orient="records"):
        url = str(rec.get("url", "")).rstrip("/")
        if not url:
            continue
        payload = {c: _sanitize_for_json(rec[c]) if not pd.isna(rec.get(c)) else None for c in data_cols}
        status = str(rec.get("status") or "") if "status" in rec else None
        title = str(rec.get("title") or "") if "title" in rec else None
        raw_fm = rec.get("fetch_method")
        fetch_method = (
            "static"
            if pd.isna(raw_fm)
            else (str(raw_fm).strip() or "static")
        )
        rows.append((crawl_run_id, url, status, title, fetch_method, _json_val(payload)))
    return rows


def _write_crawl_rows(conn: Connection, rows: list[tuple]) -> None:
    if not rows:
        return
    normalized: list[tuple] = []
    for row in rows:
        if len(row) == 5:
            normalized.append((row[0], row[1], row[2], row[3], "static", row[4]))
        else:
            normalized.append(row)
    try:
        _executemany(conn, _CRAWL_INSERT_SQL, normalized, page_size=_CRAWL_BATCH_SIZE)
    except Exception:
        legacy = [(r[0], r[1], r[2], r[3], r[5]) for r in normalized]
        _executemany(conn, _CRAWL_INSERT_SQL_LEGACY, legacy, page_size=_CRAWL_BATCH_SIZE)


def write_crawl_batch(
    conn: Connection,
    rows: list[tuple],
    crawl_run_id: int,
    *,
    commit: bool = True,
) -> None:
    """Insert a batch of crawl rows (each tuple: run_id, url, status, title, fetch_method, data Json)."""
    if not rows:
        return
    _write_crawl_rows(conn, rows)
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
            _write_crawl_rows(conn, rows)


def read_crawl(conn: Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    try:
        return _read_crawl_rows(conn, run_id, include_fetch_method=True)
    except Exception:
        try:
            return _read_crawl_rows(conn, run_id, include_fetch_method=False)
        except Exception:
            return pd.DataFrame()


def _read_crawl_rows(
    conn: Connection,
    run_id: Optional[int],
    *,
    include_fetch_method: bool,
) -> pd.DataFrame:
    if run_id is None:
        run_id = get_latest_crawl_run_id(conn)
    if include_fetch_method:
        if run_id is None:
            cur = conn.execute("SELECT url, fetch_method, data FROM crawl_results")
        else:
            cur = conn.execute(
                "SELECT url, fetch_method, data FROM crawl_results WHERE crawl_run_id = %s",
                (run_id,),
            )
    elif run_id is None:
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
        rec: dict[str, Any] = {"url": row["url"]}
        fm_col: Optional[str] = None
        if include_fetch_method and "fetch_method" in row.keys():
            fm_col = str(row["fetch_method"] or "static").strip() or "static"
        data = _parse_row_json(row) or {}
        if isinstance(data, dict):
            rec.update(data)
        if fm_col is not None:
            rec["fetch_method"] = fm_col
        elif not include_fetch_method:
            rec["fetch_method"] = str(
                (data.get("fetch_method") if isinstance(data, dict) else None) or "static"
            ).strip() or "static"
        elif "fetch_method" not in rec:
            rec["fetch_method"] = "static"
        records.append(rec)
    df = pd.DataFrame(records)
    for c in _BOOL_COLS:
        if c in df.columns:
            df[c] = df[c].astype(bool)
    return df


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


