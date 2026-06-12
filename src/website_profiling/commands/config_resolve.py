"""Config loading and shared CLI helpers."""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from collections.abc import Callable

from ..config import get_bool, load_config, load_config_from_db


def shadow_config_path() -> str:
    from ..db.storage import get_data_dir

    return os.path.join(get_data_dir(), "pipeline-config.txt")


def require_database_url() -> None:
    from ..db.storage import get_database_url

    get_database_url()


def lighthouse_work_dir() -> str:
    return tempfile.mkdtemp(prefix="wp-lighthouse-")


def cleanup_lighthouse_work_dir(work_dir: str) -> None:
    if not work_dir:
        return
    tmp_root = os.path.realpath(tempfile.gettempdir())
    if os.path.realpath(work_dir).startswith(tmp_root):
        shutil.rmtree(work_dir, ignore_errors=True)


def active_property_id_from_cfg(cfg: dict | None = None) -> int | None:
    """Resolve active property: WP_PROPERTY_ID env (spawned jobs) then pipeline config."""
    raw = os.environ.get("WP_PROPERTY_ID", "").strip()
    if not raw and cfg:
        raw = str(cfg.get("active_property_id") or "").strip()
    if not raw:
        return None
    try:
        pid = int(raw)
        return pid if pid > 0 else None
    except ValueError:
        return None


def apply_property_spawn_overlay(cfg: dict[str, str]) -> dict[str, str]:
    """When WP_PROPERTY_ID is set, overlay property site_url and crawl preset onto cfg."""
    raw = os.environ.get("WP_PROPERTY_ID", "").strip()
    if not raw:
        return cfg
    try:
        prop_id = int(raw)
    except ValueError:
        return cfg
    if prop_id <= 0:
        return cfg

    from ..db import db_session
    from ..db.property_store import get_property_by_id

    with db_session() as conn:
        prop = get_property_by_id(conn, prop_id)
    if not prop:
        return cfg

    merged = dict(cfg)
    merged["active_property_id"] = str(prop_id)
    site_url = str(prop.get("site_url") or "").strip()
    if site_url:
        merged["start_url"] = site_url
    preset = str(prop.get("default_crawl_preset") or "").strip()
    if preset:
        from ..crawl_presets import apply_crawl_preset

        merged = apply_crawl_preset(preset, merged)
    return merged


def resolve_property_id_from_cfg(cfg: dict | None = None, conn=None) -> int | None:
    """active_property_id, then property row for start_url domain."""
    pid = active_property_id_from_cfg(cfg)
    if pid is not None:
        return pid
    if not cfg:
        return None
    from ..db.property_store import canonical_domain_from_start_url, get_property_by_domain

    domain = canonical_domain_from_start_url(str(cfg.get("start_url") or ""))
    if not domain:
        return None

    def _lookup(c):
        prop = get_property_by_domain(c, domain)
        return int(prop["id"]) if prop else None

    if conn is not None:
        return _lookup(conn)
    from ..db import db_session

    with db_session() as c:
        return _lookup(c)


def google_db_has_gsc(cfg: dict | None = None) -> bool:
    from ..db import db_session
    from ..db.storage import _parse_row_json

    property_id = active_property_id_from_cfg(cfg)
    try:
        with db_session() as conn:
            if property_id is not None:
                cur = conn.execute(
                    """
                    SELECT data FROM google_data
                    WHERE property_id = %s
                    ORDER BY id DESC LIMIT 1
                    """,
                    (property_id,),
                )
            else:
                cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            if not row:
                return False
            data = _parse_row_json(row)
            if not isinstance(data, dict):
                return False
            gsc = data.get("gsc_full") or data.get("gsc") or {}
            return bool(gsc.get("top_queries") or gsc.get("by_page"))
    except Exception:
        return False


def should_enrich_keywords_after_report(cfg: dict) -> bool:
    if "enrich_keywords_after_report" in cfg:
        return get_bool(cfg, "enrich_keywords_after_report", False)
    return get_bool(cfg, "enable_google_search_console", False)


def resolved_start_url(cfg: dict) -> str:
    return (cfg.get("start_url") or "").strip()


def resolved_lighthouse_url(cfg: dict) -> str:
    return (cfg.get("lighthouse_url") or "").strip() or resolved_start_url(cfg)


def require_start_url(cfg: dict, *, for_step: str) -> str:
    url = resolved_start_url(cfg)
    if not url:
        print(
            f"Error: start_url is required for {for_step}. "
            "Set it in Run audit (Site URL) or saved audit settings.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def require_lighthouse_url(cfg: dict) -> str:
    url = resolved_lighthouse_url(cfg)
    if not url:
        print(
            "Error: lighthouse_url or start_url is required for Lighthouse. "
            "Set Site URL in Run audit.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


PathFn = Callable[[str, str], str]


def make_path_fn(cfg: dict[str, str], cwd: str) -> PathFn:
    def path(key: str, default: str) -> str:
        p = cfg.get(key, default)
        if not os.path.isabs(p):
            p = os.path.join(cwd, p)
        return p

    return path


def resolve_config(args: argparse.Namespace) -> tuple[dict[str, str], str]:
    cfg: dict[str, str] = {}
    cwd: str = os.getcwd()

    if args.config:
        cfg_path = os.path.abspath(args.config)
        if not os.path.isfile(cfg_path):
            print(f"Config file not found: {cfg_path}", file=sys.stderr)
            sys.exit(1)
        cfg = load_config(cfg_path)
        cwd = os.path.dirname(cfg_path) or os.getcwd()
    else:
        try:
            require_database_url()
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)
        cfg = load_config_from_db()
        from ..db.storage import get_data_dir

        cwd = get_data_dir()
        if cfg:
            print(
                "[Config] Loaded from pipeline_config table (PostgreSQL)",
                file=sys.stderr,
                flush=True,
            )
        else:
            shadow = shadow_config_path()
            if os.path.isfile(shadow):
                cfg = load_config(shadow)
                cwd = os.path.dirname(shadow) or os.getcwd()
                print(
                    f"[Config] Loaded from shadow file ({shadow})",
                    file=sys.stderr,
                    flush=True,
                )
            else:
                print(
                    "No audit settings found. Open Run audit in the web app, "
                    "configure settings, and click Save — or pass --config path.",
                    file=sys.stderr,
                )
                sys.exit(1)

    cfg = apply_property_spawn_overlay(cfg)
    return cfg, cwd


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Site Audit CLI: crawl a property, build site audit reports, and sync Google data. Settings from Run audit or --config."
    )
    parser.add_argument(
        "--config",
        "-c",
        default=None,
        help="Optional key=value config file (default: pipeline_config in PostgreSQL)",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=[
            "crawl",
            "report",
            "plot",
            "lighthouse",
            "keywords",
            "warnings",
            "enrich",
            "google",
            "gsc-links-import",
            "page-live",
            "page-coach",
            "chat",
        ],
        help="Run only this step (default: run all steps according to config)",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Page URL for page-live / page-coach commands.",
    )
    parser.add_argument(
        "--no-persist",
        action="store_true",
        dest="no_persist",
        help="For page-live: do not write to page_google_snapshots.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="For page-coach: bypass LLM cache.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="as_json",
        help="Emit JSON only (page-coach).",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="For 'google' command: validate credentials and API access without storing data.",
    )
    parser.add_argument(
        "--list-properties",
        action="store_true",
        dest="list_properties",
        help="For 'google' command: print accessible GSC sites and GA4 properties as JSON.",
    )
    parser.add_argument(
        "--property-id",
        type=int,
        default=None,
        dest="property_id",
        help="WebsiteProfiling property id for per-site Google credentials.",
    )
    parser.add_argument(
        "--csv-stdin",
        action="store_true",
        dest="csv_stdin",
        help="For gsc-links-import: read CSV from stdin.",
    )
    parser.add_argument(
        "--csv-file",
        default=None,
        dest="csv_file",
        help="For gsc-links-import: path to CSV file.",
    )
    parser.add_argument(
        "--file-name",
        default=None,
        dest="file_name",
        help="For gsc-links-import: original upload file name.",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="For gsc-links-import: print import status JSON and exit.",
    )
    parser.add_argument(
        "--enrich-google",
        action="store_true",
        dest="enrich_google",
        help="For 'keywords' command: run keyword research (Suggest, Search Console merge, Datamuse) without re-crawling.",
    )
    parser.add_argument(
        "--expand-only",
        action="store_true",
        dest="expand_only",
        help="For 'keywords' command: only run Suggest expansion and print JSON to stdout.",
    )
    parser.add_argument(
        "--stdin-json",
        action="store_true",
        dest="stdin_json",
        help="For 'chat' command: read JSON payload from stdin and emit NDJSON events.",
    )
    return parser
