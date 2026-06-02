"""CLI: google command."""
from __future__ import annotations

import argparse
import os
import sys

from ..config import get_int
from .config_resolve import PathFn


def run(cfg: dict, cwd: str, path: PathFn, args: argparse.Namespace) -> None:
    from ..integrations.google.auth import build_credentials, read_secrets
    from ..integrations.google.fetch import fetch_google_data, list_properties

    credentials_path = cfg.get("google_credentials_path", "").strip()
    if credentials_path and not os.path.isabs(credentials_path):
        credentials_path = os.path.join(cwd, credentials_path)

    if getattr(args, "list_properties", False):
        try:
            props = list_properties(credentials_path or None)
            import json as _json

            print(_json.dumps(props), flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"Error listing properties: {e}", file=sys.stderr)
            sys.exit(1)

    if getattr(args, "test", False):
        _run_google_test(credentials_path)
        return

    print("WebsiteProfiling: Google fetch...", flush=True)
    from ..db import db_session, get_latest_crawl_run_id, read_crawl
    from ..integrations.google.store import write_google_data

    date_range_days = get_int(cfg, "google_date_range_days", 28) or 28

    crawl_urls: list[str] = []
    start_url_for_join = cfg.get("start_url", "")
    try:
        with db_session() as conn:
            run_id = get_latest_crawl_run_id(conn)
            if run_id is not None:
                df = read_crawl(conn, run_id)
                if "url" in df.columns:
                    crawl_urls = df["url"].dropna().astype(str).str.strip().tolist()
    except Exception as e:
        print(f"  Warning: could not read crawl URLs for join stats: {e}", flush=True)

    try:
        import google.auth.exceptions as _gae

        google_data = fetch_google_data(
            credentials_path=credentials_path or None,
            date_range_days=date_range_days,
            crawl_urls=crawl_urls,
            start_url=start_url_for_join,
            config=cfg,
        )
    except _gae.RefreshError:
        print(
            "Google connection expired -- reconnect in Integrations.",
            file=sys.stderr,
        )
        sys.exit(1)
    except RuntimeError as e:
        print(f"Google fetch error: {e}", file=sys.stderr)
        sys.exit(1)

    with db_session() as conn:
        write_google_data(conn, google_data)

    if google_data.get("errors"):
        print("  Partial errors:", flush=True)
        for err in google_data["errors"]:
            print(f"    - {err}", flush=True)

    print("Google fetch done. Data stored in google_data table.", flush=True)
    sys.exit(0)


def _run_google_test(credentials_path: str | None) -> None:
    print("WebsiteProfiling: Google credentials test...", flush=True)
    from ..integrations.google.auth import build_credentials, read_secrets

    warnings: list[str] = []
    try:
        import google.auth.exceptions as _gae

        creds = build_credentials(credentials_path or None)
        print("  Google credentials: OK (token refreshed)", flush=True)

        secrets = read_secrets(credentials_path or None)
        gsc_site_url = secrets.get("gscSiteUrl", "")
        ga4_property_id = secrets.get("ga4PropertyId", "")

        if gsc_site_url:
            from ..integrations.google.gsc import (
                describe_gsc_site_mismatch,
                list_gsc_sites,
                probe_gsc_site,
                resolve_gsc_site_url,
            )

            sites = list_gsc_sites(creds)
            print(f"  GSC: found {len(sites)} accessible site(s): {sites}", flush=True)
            resolved, site_error = resolve_gsc_site_url(gsc_site_url, sites)
            if resolved:
                if resolved != gsc_site_url:
                    print(
                        f"  GSC: NOTE -- Configured '{gsc_site_url}' will use '{resolved}' "
                        "(Search Console requires an exact property URL). "
                        "Save the exact URL from 'Load from account' to avoid this note.",
                        flush=True,
                    )
                ok, probe_msg = probe_gsc_site(creds, resolved)
                if ok:
                    print(f"  GSC: OK -- {probe_msg}", flush=True)
                else:
                    print(f"  GSC: ERROR -- {probe_msg}", flush=True)
                    warnings.append(probe_msg)
            else:
                detail = site_error or describe_gsc_site_mismatch(gsc_site_url, sites)
                print(f"  GSC: ERROR -- {detail}", flush=True)
                warnings.append(detail)
        else:
            print(
                "  GSC: skipped (no gscSiteUrl configured — set Website in Search Console in Integrations)",
                flush=True,
            )
            warnings.append("GSC site URL is not configured.")

        if ga4_property_id:
            from ..integrations.google.ga4 import list_ga4_properties, probe_ga4_property

            props, list_error = list_ga4_properties(creds)
            if list_error:
                print(f"  GA4: NOTE -- {list_error}", flush=True)
            elif props:
                names = [f"{p['displayName']} ({p['id']})" for p in props]
                print(f"  GA4: found {len(props)} accessible propert(ies): {names}", flush=True)
            ok, probe_msg = probe_ga4_property(creds, ga4_property_id)
            if ok:
                print(f"  GA4: OK -- {probe_msg}", flush=True)
                if props and ga4_property_id not in [p["id"] for p in props]:
                    msg = (
                        f"Property {ga4_property_id} works via Data API but was not in the "
                        "account property list (listing may be incomplete)."
                    )
                    print(f"  GA4: NOTE -- {msg}", flush=True)
            else:
                print(f"  GA4: ERROR -- {probe_msg}", flush=True)
                warnings.append(probe_msg)
        else:
            print(
                "  GA4: skipped (no ga4PropertyId configured — set Analytics property in Integrations)",
                flush=True,
            )
            warnings.append("GA4 property ID is not configured.")

        if warnings:
            print("", flush=True)
            print("Google test completed with issues:", flush=True)
            for i, w in enumerate(warnings, 1):
                print(f"  {i}. {w}", flush=True)
            print("", flush=True)
            print(
                "Data fetch will fail or return empty until these are fixed. "
                "In Integrations: click 'Load from account', pick exact GSC site + GA4 property, Save, then Test again.",
                flush=True,
            )
            sys.exit(1)

        print("Google test passed — GSC and GA4 are configured and reachable.", flush=True)
        sys.exit(0)
    except _gae.RefreshError:
        print(
            "Google connection expired -- reconnect in Integrations.",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"Google test failed: {e}", file=sys.stderr)
        sys.exit(1)
