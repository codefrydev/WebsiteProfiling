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


def google_db_has_gsc() -> bool:
    from ..db import db_session
    from ..db.storage import _parse_json_field

    try:
        with db_session() as conn:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            if not row:
                return False
            data = _parse_json_field(row["data"])
            if not isinstance(data, dict):
                return False
            gsc = data.get("gsc_full") or {}
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
            "Set it in the Pipeline runner UI (Start URL) or pipeline-config.txt.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def require_lighthouse_url(cfg: dict) -> str:
    url = resolved_lighthouse_url(cfg)
    if not url:
        print(
            "Error: lighthouse_url or start_url is required for Lighthouse. "
            "Set Start URL in the Pipeline runner UI.",
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
            print("[Config] Loaded from pipeline_config table (PostgreSQL)", flush=True)
        else:
            shadow = shadow_config_path()
            if os.path.isfile(shadow):
                cfg = load_config(shadow)
                cwd = os.path.dirname(shadow) or os.getcwd()
                print(f"[Config] Loaded from shadow file ({shadow})", flush=True)
            else:
                print(
                    "No pipeline config found. Open the web UI (Pipeline runner), "
                    "configure settings, and click Save — or pass --config path.",
                    file=sys.stderr,
                )
                sys.exit(1)

    return cfg, cwd


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="WebsiteProfiling: crawl site, generate reports and link graph. All options read from config file."
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
        choices=["crawl", "report", "plot", "lighthouse", "keywords", "warnings", "enrich", "google"],
        help="Run only this step (default: run all steps according to config)",
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
        "--enrich-google",
        action="store_true",
        dest="enrich_google",
        help="For 'keywords' command: run Google enrichment (Suggest, GSC merge, Datamuse, etc.) without re-running the crawl.",
    )
    parser.add_argument(
        "--expand-only",
        action="store_true",
        dest="expand_only",
        help="For 'keywords' command: only run Suggest expansion and print JSON to stdout.",
    )
    return parser
