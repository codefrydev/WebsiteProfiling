"""
CLI: read config file and run crawl, report, or plot.
"""
from __future__ import annotations

from .commands import (
    config_resolve,
    enrich_cmd,
    google_cmd,
    gsc_links_cmd,
    help_cmd,
    keywords_cmd,
    lighthouse_cmd,
    page_coach_cmd,
    page_live_cmd,
    page_markdown_cmd,
    pipeline_cmd,
    warnings_cmd,
)


def main() -> None:
    parser = config_resolve.build_parser()
    args = parser.parse_args()

    cfg, cwd = config_resolve.resolve_config(args)
    path = config_resolve.make_path_fn(cfg, cwd)

    if args.command == "lighthouse":
        lighthouse_cmd.run(cfg, args)
    elif args.command == "keywords":
        keywords_cmd.run(cfg, args)
    elif args.command == "warnings":
        warnings_cmd.run(cfg, cwd, path, args)
    elif args.command == "enrich":
        enrich_cmd.run(cfg, args)
    elif args.command == "google":
        google_cmd.run(cfg, cwd, path, args)
    elif args.command == "gsc-links-import":
        gsc_links_cmd.run(cfg, args)
    elif args.command == "page-live":
        page_live_cmd.run(cfg, cwd, args)
    elif args.command == "page-coach":
        page_coach_cmd.run(cfg, cwd, args)
    elif args.command == "page-markdown":
        page_markdown_cmd.run(cfg, args)
    elif args.command == "help":
        help_cmd.run(cfg, args)
    else:
        pipeline_cmd.run(cfg, args)


if __name__ == "__main__":
    main()
