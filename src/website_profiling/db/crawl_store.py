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
    discovery_mode: Optional[str] = None,
) -> int:
    mode = (render_mode or "static").strip().lower()
    disc = (discovery_mode or "spider").strip().lower()
    cur = conn.execute(
        "INSERT INTO crawl_runs (created_at, start_url, property_id, render_mode, discovery_mode) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (_now_iso(), start_url, property_id, mode, disc),
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


def _normalize_start_url_key(url: str) -> str:
    trimmed = (url or "").strip()
    if not trimmed:
        return ""
    if not trimmed.startswith(("http://", "https://")):
        trimmed = f"https://{trimmed}"
    return trimmed.lower()


def get_latest_crawl_run_id_for_property(conn: Connection, property_id: int) -> Optional[int]:
    """Latest crawl run scoped to a property, or None if none exist."""
    try:
        cur = conn.execute(
            "SELECT id FROM crawl_runs WHERE property_id = %s ORDER BY id DESC LIMIT 1",
            (int(property_id),),
        )
        row = cur.fetchone()
        return int(row["id"]) if row else None
    except Exception:
        return None


def get_latest_crawl_run_id_for_start_url(conn: Connection, start_url: str) -> Optional[int]:
    """Latest crawl run whose start_url matches (case-insensitive)."""
    target = _normalize_start_url_key(start_url)
    if not target:
        return None
    try:
        cur = conn.execute(
            """SELECT id, start_url FROM crawl_runs
               WHERE start_url IS NOT NULL AND trim(start_url) <> ''
               ORDER BY id DESC
               LIMIT 100""",
        )
        for row in cur.fetchall() or []:
            if _normalize_start_url_key(str(row.get("start_url") or "")) == target:
                return int(row["id"])
        return None
    except Exception:
        return None


def resolve_crawl_run_id_for_cfg(
    conn: Connection,
    *,
    property_id: Optional[int] = None,
    start_url: Optional[str] = None,
) -> Optional[int]:
    """Pick crawl run for pipeline/report/Lighthouse: property, then start URL, then global latest."""
    if property_id is not None:
        rid = get_latest_crawl_run_id_for_property(conn, property_id)
        if rid is not None:
            return rid
    site = (start_url or "").strip()
    if site:
        rid = get_latest_crawl_run_id_for_start_url(conn, site)
        if rid is not None:
            return rid
    return get_latest_crawl_run_id(conn)


def get_crawl_run_info(conn: Connection, run_id: int) -> Optional[dict[str, Any]]:
    try:
        cur = conn.execute(
            "SELECT created_at, start_url, render_mode FROM crawl_runs WHERE id = %s",
            (run_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {
            "created_at": row["created_at"],
            "start_url": row["start_url"],
            "render_mode": row["render_mode"],
        }
    except Exception:
        return None


def set_mobile_run_id(conn: Connection, desktop_run_id: int, mobile_run_id: int) -> None:
    """Link a mobile crawl run to its paired desktop run."""
    conn.execute(
        "UPDATE crawl_runs SET mobile_run_id = %s WHERE id = %s",
        (mobile_run_id, desktop_run_id),
    )
    conn.commit()


def get_mobile_run_id(conn: Connection, run_id: int) -> Optional[int]:
    """Return the mobile_run_id paired with this desktop run, or None."""
    try:
        cur = conn.execute(
            "SELECT mobile_run_id FROM crawl_runs WHERE id = %s", (run_id,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        val = row["mobile_run_id"]
        return int(val) if val is not None else None
    except Exception:
        return None


def read_mobile_desktop_delta(conn: Connection, desktop_run_id: int) -> list[dict[str, Any]]:
    """Compare desktop vs paired mobile crawl, returning per-URL delta rows.

    Each row has: url, desktop, mobile (each with title/h1/word_count/status),
    and boolean flags title_differs, h1_differs, status_differs, plus word_count_delta.
    Only URLs present in both runs with at least one meaningful difference are included.
    """
    mobile_run_id = get_mobile_run_id(conn, desktop_run_id)
    if mobile_run_id is None:
        return []
    desktop_df = read_crawl(conn, desktop_run_id)
    mobile_df = read_crawl(conn, mobile_run_id)
    if desktop_df.empty or mobile_df.empty:
        return []

    def _norm(s: Any) -> str:
        return str(s or "").lower()

    def _int(v: Any) -> int:
        try:
            return int(v or 0)
        except (TypeError, ValueError):
            return 0

    desktop_map = {_norm(r.get("url")): r for r in desktop_df.to_dict("records")}
    mobile_map = {_norm(r.get("url")): r for r in mobile_df.to_dict("records")}

    deltas: list[dict[str, Any]] = []
    for url_key, dr in desktop_map.items():
        mr = mobile_map.get(url_key)
        if mr is None:
            continue
        d_title = str(dr.get("title") or "")
        m_title = str(mr.get("title") or "")
        d_h1 = str(dr.get("h1") or "")
        m_h1 = str(mr.get("h1") or "")
        d_wc = _int(dr.get("word_count"))
        m_wc = _int(mr.get("word_count"))
        d_st = _int(dr.get("status"))
        m_st = _int(mr.get("status"))

        title_diff = d_title != m_title
        h1_diff = d_h1 != m_h1
        wc_diff = abs(d_wc - m_wc)
        status_diff = d_st != m_st

        if not (title_diff or h1_diff or wc_diff > 50 or status_diff):
            continue
        deltas.append({
            "url": str(dr.get("url") or url_key),
            "desktop": {"title": d_title, "h1": d_h1, "word_count": d_wc, "status": d_st},
            "mobile": {"title": m_title, "h1": m_h1, "word_count": m_wc, "status": m_st},
            "title_differs": title_diff,
            "h1_differs": h1_diff,
            "word_count_delta": wc_diff,
            "status_differs": status_diff,
        })

    # Sort: status diffs first (mobile indexing risk), then title, then word count delta
    deltas.sort(
        key=lambda d: -(
            (4 if d["status_differs"] else 0)
            + (2 if d["title_differs"] else 0)
            + (1 if d["h1_differs"] else 0)
            + (1 if d["word_count_delta"] > 100 else 0)
        )
    )
    return deltas


def save_pause_state(conn: Connection, run_id: int, state: dict) -> None:
    """Persist frontier state for a paused crawl run."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE crawl_runs SET pause_state = %s, paused_at = %s WHERE id = %s",
        (json.dumps(state), now, run_id),
    )
    conn.commit()


def load_pause_state(conn: Connection, run_id: int) -> Optional[dict]:
    """Load saved frontier state for a paused crawl run."""
    try:
        cur = conn.execute(
            "SELECT pause_state FROM crawl_runs WHERE id = %s", (run_id,)
        )
        row = cur.fetchone()
        if row is None or row["pause_state"] is None:
            return None
        val = row["pause_state"]
        if isinstance(val, str):
            return json.loads(val)
        return dict(val)
    except Exception:
        return None


def clear_pause_state(conn: Connection, run_id: int) -> None:
    """Clear saved frontier state after a successful resume."""
    try:
        conn.execute(
            "UPDATE crawl_runs SET pause_state = NULL, paused_at = NULL WHERE id = %s",
            (run_id,),
        )
        conn.commit()
    except Exception:
        pass


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

def _crawl_rows_from_df(df: pd.DataFrame, crawl_run_id: int) -> list[tuple]:
    rows: list[tuple] = []
    if df.empty or "url" not in df.columns:
        return rows
    data_cols = [
        c for c in df.columns if c not in ("url", "crawl_run_id", "fetch_method")
    ]
    for rec in df.to_dict(orient="records"):
        url = str(rec.get("url", "")).strip()
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
    with conn.transaction():
        _executemany(conn, _CRAWL_INSERT_SQL, rows, page_size=_CRAWL_BATCH_SIZE)


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

    with conn.transaction():
        if crawl_run_id is not None:
            conn.execute("DELETE FROM crawl_results WHERE crawl_run_id = %s", (crawl_run_id,))
            try:
                with conn.transaction():
                    conn.execute("DELETE FROM crawl_page_html WHERE crawl_run_id = %s", (crawl_run_id,))
            except Exception:
                pass
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


_MERGE_FIELDS_BATCH_SIZE = 200
_MERGE_FIELDS_SQL = """UPDATE crawl_results
SET data = COALESCE(data, '{}'::jsonb) || %s::jsonb
WHERE crawl_run_id = %s AND url = %s"""


def merge_crawl_result_fields_batch(
    conn: Connection,
    crawl_run_id: int,
    updates: list[dict[str, Any]],
    *,
    commit: bool = True,
) -> int:
    """Merge per-URL content fields into crawl_results.data JSONB.

    Returns the number of URLs attempted (not necessarily all matched an existing row).
    """
    if not updates:
        return 0
    params: list[tuple] = []
    for item in updates:
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        fields = {k: _sanitize_for_json(v) for k, v in item.items() if k != "url"}
        if not fields:
            continue
        params.append((_json_val(fields), crawl_run_id, url))
    if not params:
        return 0
    _executemany(conn, _MERGE_FIELDS_SQL, params, page_size=_MERGE_FIELDS_BATCH_SIZE)
    if commit:
        conn.commit()
    return len(params)


def read_crawl(conn: Connection, run_id: Optional[int] = None) -> pd.DataFrame:
    if run_id is None:
        run_id = get_latest_crawl_run_id(conn)
    if run_id is None:
        cur = conn.execute("SELECT url, fetch_method, data FROM crawl_results")
    else:
        cur = conn.execute(
            "SELECT url, fetch_method, data FROM crawl_results WHERE crawl_run_id = %s",
            (run_id,),
        )
    rows = cur.fetchall()
    if not rows:
        return pd.DataFrame()
    records = []
    for row in rows:
        rec: dict[str, Any] = {"url": row["url"]}
        if "fetch_method" in row.keys():
            rec["fetch_method"] = str(row["fetch_method"] or "static").strip() or "static"
        data = _parse_row_json(row) or {}
        if isinstance(data, dict):
            rec.update(data)
        if "fetch_method" not in rec:
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
                    [(rid, a, b) for a, b in edges],
                )
        conn.commit()
        return
    conn.execute("DELETE FROM edges WHERE crawl_run_id = %s", (crawl_run_id,))
    if edges:
        _executemany(
            conn,
            "INSERT INTO edges (crawl_run_id, from_url, to_url) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            [(crawl_run_id, a, b) for a, b in edges],
        )
    conn.commit()


def write_link_edges(
    conn: Connection,
    edges: list[dict],
    crawl_run_id: Optional[int] = None,
) -> None:
    if crawl_run_id is None:
        crawl_run_id = get_latest_crawl_run_id(conn)
    if crawl_run_id is None or not edges:
        return
    conn.execute("DELETE FROM link_edges WHERE crawl_run_id = %s", (crawl_run_id,))
    rows = []
    for e in edges:
        from_u = str(e.get("from_url") or "").strip()
        to_u = str(e.get("to_url") or "").strip()
        if not from_u or not to_u:
            continue
        rows.append((
            crawl_run_id,
            from_u,
            to_u,
            str(e.get("anchor_text") or "")[:500],
            str(e.get("rel") or "")[:200],
            bool(e.get("is_nofollow")),
            bool(e.get("is_sponsored")),
            bool(e.get("is_ugc")),
            str(e.get("link_type") or "internal"),
            str(e.get("position") or "content"),
        ))
    if rows:
        _executemany(
            conn,
            """INSERT INTO link_edges (
                crawl_run_id, from_url, to_url, anchor_text, rel,
                is_nofollow, is_sponsored, is_ugc, link_type, position
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING""",
            rows,
        )
    conn.commit()


def read_link_edges(
    conn: Connection,
    run_id: Optional[int] = None,
    *,
    limit: int = 5000,
) -> list[dict[str, Any]]:
    if run_id is None:
        run_id = get_latest_crawl_run_id(conn)
    if run_id is None:
        return []
    try:
        cur = conn.execute(
            """SELECT from_url, to_url, anchor_text, rel,
                      is_nofollow, is_sponsored, is_ugc, link_type,
                      COALESCE(position, 'content') AS position
               FROM link_edges WHERE crawl_run_id = %s LIMIT %s""",
            (run_id, max(1, int(limit))),
        )
        return [dict(row) for row in cur.fetchall()]
    except Exception:
        return []


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


