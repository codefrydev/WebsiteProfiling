"""Lighthouse runs, audits, and summaries."""
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
        data = _parse_row_json(row)
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
        data = _parse_row_json(row)
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
        data = _parse_row_json(row)
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
            data = _parse_row_json(row)
            if isinstance(data, dict):
                out[str(row["url"])] = data
    except Exception:
        pass
    return out


