"""Historical data preservation and backups."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from psycopg import Connection
from psycopg.sql import SQL, Identifier
from urllib.parse import urlparse

from ..console_io import console_print
from ._common import (
    _executemany,
    _json_val,
    _now_iso,
    _parse_json_field,
    _sanitize_for_json,
)
from .pool import db_session, get_data_dir, get_database_url

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
        parsed = urlparse(get_database_url())
        pg_env = {**os.environ}
        if parsed.hostname:
            pg_env["PGHOST"] = parsed.hostname
        if parsed.port:
            pg_env["PGPORT"] = str(parsed.port)
        if parsed.username:
            pg_env["PGUSER"] = parsed.username
        if parsed.password:
            pg_env["PGPASSWORD"] = parsed.password
        dbname = (parsed.path or "").lstrip("/")
        cmd = ["pg_dump", "-Fc", "-f", str(out_path)]
        if dbname:
            cmd.append(dbname)
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            timeout=300,
            env=pg_env,
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
        "gsc_links_data",
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
                        cur.execute(SQL("SELECT * FROM {}").format(Identifier(table)))
                        result[table] = [dict(row) for row in cur.fetchall()]
                except Exception as e:
                    console_print(
                        f"  Warning: could not read historical table '{table}': {e}",
                        file=sys.stderr,
                    )
    except Exception as e:
        console_print(
            f"  Warning: could not read historical data (a DB backup is still taken before any overwrite): {e}",
            file=sys.stderr,
        )
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
        """INSERT INTO gsc_links_data (id, fetched_at, property_id, data)
           VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        data.get("gsc_links_data", []),
        ["id", "fetched_at", "property_id", "data"],
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
    conn.execute("TRUNCATE crawl_results, crawl_page_html, edges, nodes RESTART IDENTITY CASCADE")
    conn.commit()


