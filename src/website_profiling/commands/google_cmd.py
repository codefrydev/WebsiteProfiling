"""CLI: google command."""
from __future__ import annotations

import argparse
import sys

from ..config import get_int
from .config_resolve import PathFn, resolve_property_id_from_cfg


def _resolved_property_id(cfg: dict, args: argparse.Namespace) -> int | None:
    if getattr(args, "property_id", None):
        return int(args.property_id)
    return resolve_property_id_from_cfg(cfg)


def run(cfg: dict, cwd: str, path: PathFn, args: argparse.Namespace) -> None:
    property_id = _resolved_property_id(cfg, args)

    if getattr(args, "list_properties", False):
        try:
            if _integrations_url():
                props = _list_properties_via_integrations(property_id)
            else:
                from ..integrations.google.fetch import list_properties

                props = list_properties(property_id=property_id)
            import json as _json

            print(_json.dumps(props), flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"Error listing properties: {e}", file=sys.stderr)
            sys.exit(1)

    if getattr(args, "test", False):
        _run_google_test(property_id)
        return

    print("Site Audit: Google fetch...", flush=True)
    from ..db import db_session, get_latest_crawl_run_id, read_crawl

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

    integrations_url = _integrations_url()
    if integrations_url:
        try:
            google_data = _fetch_via_integrations(
                integrations_url,
                property_id=property_id,
                date_range_days=date_range_days,
                crawl_urls=crawl_urls,
                start_url=start_url_for_join,
                config=cfg,
            )
        except RuntimeError as e:
            print(f"Google fetch error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        from ..integrations.google.store import write_google_data

        try:
            import google.auth.exceptions as _gae

            from ..integrations.google.fetch import fetch_google_data

            google_data = fetch_google_data(
                date_range_days=date_range_days,
                crawl_urls=crawl_urls,
                start_url=start_url_for_join,
                config=cfg,
                property_id=property_id,
            )
        except _gae.RefreshError:
            print(
                "Google connection expired -- reconnect Google for this site.",
                file=sys.stderr,
            )
            sys.exit(1)
        except RuntimeError as e:
            print(f"Google fetch error: {e}", file=sys.stderr)
            sys.exit(1)

        with db_session() as conn:
            write_google_data(conn, google_data, property_id=property_id)

    if google_data.get("errors"):
        print("  Partial errors:", flush=True)
        for err in google_data["errors"]:
            print(f"    - {err}", flush=True)

    print("Google fetch done. Data stored in google_data table.", flush=True)
    sys.exit(0)


def _run_google_test(property_id: int | None) -> None:
    integrations_url = _integrations_url()
    if integrations_url and property_id:
        try:
            import json
            import urllib.error
            import urllib.request

            req = urllib.request.Request(
                f"{integrations_url}/api/properties/{property_id}/google/test",
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            log = str(result.get("log") or "")
            if log:
                print(log, flush=True)
            sys.exit(int(result.get("exitCode") or (0 if result.get("ok") else 1)))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            print(detail or f"Google test failed: HTTP {exc.code}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Google test failed: {e}", file=sys.stderr)
            sys.exit(1)

    print("Site Audit: Google credentials test...", flush=True)
    from ..integrations.google.auth import build_credentials, resolve_google_targets

    warnings: list[str] = []
    try:
        import google.auth.exceptions as _gae

        creds = build_credentials(property_id=property_id)
        print("  Google credentials: OK (token refreshed)", flush=True)

        gsc_site_url, ga4_property_id, _days = resolve_google_targets(
            property_id=property_id
        )

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
                "  GSC: skipped (no GSC site configured for this property)",
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
                "  GA4: skipped (no GA4 property ID configured for this property)",
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
                "Connect Google for this site, pick GSC + GA4, save, then Test again.",
                flush=True,
            )
            sys.exit(1)

        print("Google test passed — GSC and GA4 are configured and reachable.", flush=True)
        sys.exit(0)
    except _gae.RefreshError:
        print(
            "Google connection expired -- reconnect Google for this site.",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"Google test failed: {e}", file=sys.stderr)
        sys.exit(1)


def _integrations_url() -> str:
    import os

    return (os.environ.get("INTEGRATIONS_SERVICE_URL") or "").strip().rstrip("/")


def _fetch_via_integrations(
    base_url: str,
    *,
    property_id: int | None,
    date_range_days: int,
    crawl_urls: list[str],
    start_url: str,
    config: dict,
) -> dict:
    import json
    import urllib.error
    import urllib.request

    if property_id is None:
        raise RuntimeError("No property selected for Google fetch.")

    body = {
        "propertyId": property_id,
        "dateRangeDays": date_range_days,
        "crawlUrls": crawl_urls,
        "startUrl": start_url,
        "config": {
            "keywordGscMaxRows": config.get("keyword_gsc_max_rows") or 25000,
            "googleUrlGapListLimit": config.get("google_url_gap_list_limit") or 200,
        },
    }
    req = urllib.request.Request(
        f"{base_url}/internal/integrations/google/fetch",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(detail or f"Integrations fetch failed: HTTP {exc.code}") from exc


def _list_properties_via_integrations(property_id: int | None) -> dict:
    import json
    import urllib.error
    import urllib.request

    if property_id is None:
        raise RuntimeError("property_id is required to list Google properties.")

    base = _integrations_url()
    req = urllib.request.Request(
        f"{base}/api/properties/{property_id}/google/properties",
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(detail or f"Integrations list failed: HTTP {exc.code}") from exc
