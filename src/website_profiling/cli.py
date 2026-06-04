"""
CLI: read config file and run crawl, report, or plot.
"""
from __future__ import annotations

from .commands import (
    config_resolve,
    enrich_cmd,
    google_cmd,
    keywords_cmd,
    lighthouse_cmd,
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
    else:
        pipeline_cmd.run(cfg, args)


if __name__ == "__main__":
    main()
