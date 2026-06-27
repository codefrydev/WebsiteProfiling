"""
PostgreSQL data layer for WebsiteProfiling: crawl, edges, nodes, lighthouse, report payload.

All DB access should go through :func:`db_session`. Schema is managed by Alembic (``alembic upgrade head``).
Requires ``DATABASE_URL`` in the environment.

Implementation is split across ``db.*_store`` modules; this module re-exports the public API.
"""
from __future__ import annotations

from ._common import _parse_json_field, _parse_row_json, _row_field, _sanitize_for_json
from .chat_store import (
    append_message,
    create_session,
    delete_session,
    get_messages,
    get_session,
    list_sessions,
    touch_session,
    update_session_title,
)
from .config_store import read_llm_config, read_pipeline_config, write_llm_config, write_pipeline_config
from .crawl_store import (
    create_crawl_run,
    get_crawl_run_info,
    get_latest_crawl_run_id,
    get_latest_crawl_run_id_for_property,
    get_latest_crawl_run_id_for_start_url,
    resolve_crawl_run_id_for_cfg,
    read_crawl,
    read_edges,
    read_nodes,
    write_crawl,
    write_crawl_batch,
    merge_crawl_result_fields_batch,
    write_edges,
    write_nodes,
)
from .html_store import (
    delete_page_html_for_run,
    read_page_html,
    read_page_html_for_run,
    write_page_html_batch,
)
from .historical import backup_db_if_exists, ensure_crawl_tables_cleared, read_historical_data, restore_historical_data
from .lighthouse_store import (
    read_latest_lighthouse_run_json,
    read_lh_audits_with_items,
    read_lh_runs_by_url,
    read_lighthouse_page_summaries,
    read_lighthouse_run_json,
    read_lighthouse_summary,
    write_lh_audits_from_run,
    write_lighthouse_page_summary,
    write_lighthouse_run,
    write_lighthouse_summary,
)
from .llm_cache_store import read_llm_cache, read_llm_cache_batch, write_llm_cache
from .pool import close_db_pool, db_session, get_data_dir, get_database_url, init_schema
from .report_store import read_report_payload, write_report_payload

__all__ = [
    "_parse_json_field",
    "_parse_row_json",
    "_row_field",
    "_sanitize_for_json",
    "append_message",
    "backup_db_if_exists",
    "close_db_pool",
    "create_crawl_run",
    "create_session",
    "delete_page_html_for_run",
    "delete_session",
    "db_session",
    "ensure_crawl_tables_cleared",
    "get_crawl_run_info",
    "get_data_dir",
    "get_messages",
    "get_session",
    "get_database_url",
    "get_latest_crawl_run_id",
    "get_latest_crawl_run_id_for_property",
    "get_latest_crawl_run_id_for_start_url",
    "resolve_crawl_run_id_for_cfg",
    "init_schema",
    "list_sessions",
    "merge_crawl_result_fields_batch",
    "read_crawl",
    "read_page_html",
    "read_page_html_for_run",
    "read_edges",
    "read_historical_data",
    "read_latest_lighthouse_run_json",
    "read_lh_audits_with_items",
    "read_lh_runs_by_url",
    "read_lighthouse_page_summaries",
    "read_lighthouse_run_json",
    "read_lighthouse_summary",
    "read_llm_cache",
    "read_llm_cache_batch",
    "read_llm_config",
    "read_nodes",
    "read_pipeline_config",
    "read_report_payload",
    "restore_historical_data",
    "touch_session",
    "update_session_title",
    "write_crawl",
    "write_crawl_batch",
    "write_page_html_batch",
    "write_edges",
    "write_lh_audits_from_run",
    "write_lighthouse_page_summary",
    "write_lighthouse_run",
    "write_lighthouse_summary",
    "write_llm_cache",
    "write_llm_config",
    "write_nodes",
    "write_pipeline_config",
    "write_report_payload",
]
