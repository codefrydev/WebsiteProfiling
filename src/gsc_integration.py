"""
Google Search Console Integration: sync GSC data and generate insights.

Usage:
    python -m src gsc connect --credentials credentials.json
    python -m src gsc sync    --property-id 1 --days 90
    python -m src gsc report  --property-id 1

Requires GOOGLE_CREDENTIALS_FILE or --credentials pointing to a service account
or OAuth2 credentials JSON file. Set GSC_SITE_URL in .env or config.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import date, timedelta
from typing import Any, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import get_connection, init_extended_schema, read_gsc_data, write_gsc_data

_GOOGLE_CREDS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "")


class GSCClient:
    """Google Search Console API client."""

    def __init__(self, credentials_file: Optional[str] = None) -> None:
        self.credentials_file = credentials_file or _GOOGLE_CREDS_FILE
        self._service = None

    def authenticate(self, credentials_file: Optional[str] = None) -> Any:
        """Authenticate with Google APIs using credentials file.

        Supports both service account and OAuth2 (installed app) credentials.
        Returns credentials object.
        """
        creds_file = credentials_file or self.credentials_file
        if not creds_file or not os.path.isfile(creds_file):
            raise FileNotFoundError(
                f"Credentials file not found: {creds_file}. "
                "Set GOOGLE_CREDENTIALS_FILE in .env or pass --credentials."
            )
        try:
            from google.oauth2 import service_account
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from googleapiclient.discovery import build
        except ImportError:
            raise ImportError(
                "Install google-auth and google-api-python-client: "
                "pip install google-auth google-auth-oauthlib google-api-python-client"
            )

        scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
        with open(creds_file) as f:
            creds_data = json.load(f)

        if creds_data.get("type") == "service_account":
            creds = service_account.Credentials.from_service_account_file(creds_file, scopes=scopes)
        else:
            # OAuth2 installed app flow
            flow = InstalledAppFlow.from_client_secrets_file(creds_file, scopes)
            creds = flow.run_local_server(port=0)

        self._service = build("searchconsole", "v1", credentials=creds)
        self.credentials_file = creds_file
        return creds

    def _get_service(self) -> Any:
        """Return authenticated Search Console service, authenticating if needed."""
        if self._service is None:
            self.authenticate()
        return self._service

    def get_properties(self) -> list[str]:
        """Return list of verified Search Console properties."""
        service = self._get_service()
        response = service.sites().list().execute()
        return [s["siteUrl"] for s in response.get("siteEntry", [])]

    def fetch_performance_data(
        self,
        site_url: str,
        start_date: str,
        end_date: str,
        dimensions: Optional[list[str]] = None,
        filters: Optional[list[dict]] = None,
        row_limit: int = 25000,
    ) -> list[dict]:
        """Fetch search performance data from GSC API.

        Args:
            site_url: Verified property URL (e.g. 'https://example.com/')
            start_date: ISO date string (YYYY-MM-DD)
            end_date: ISO date string (YYYY-MM-DD)
            dimensions: List of dimensions, e.g. ['query', 'page', 'device', 'country']
            filters: Optional filter objects per GSC API spec
            row_limit: Max rows to fetch per request (max 25000)

        Returns:
            List of row dicts with dimension keys + clicks/impressions/ctr/position.
        """
        service = self._get_service()
        dims = dimensions or ["query", "page", "device", "country"]
        request_body: dict[str, Any] = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dims,
            "rowLimit": row_limit,
            "startRow": 0,
        }
        if filters:
            request_body["dimensionFilterGroups"] = [{"filters": filters}]

        all_rows = []
        start_row = 0
        while True:
            request_body["startRow"] = start_row
            response = service.searchanalytics().query(siteUrl=site_url, body=request_body).execute()
            rows = response.get("rows", [])
            if not rows:
                break
            for row in rows:
                keys = row.get("keys", [])
                row_dict: dict[str, Any] = {
                    dims[i]: keys[i] if i < len(keys) else ""
                    for i in range(len(dims))
                }
                row_dict.update({
                    "clicks": int(row.get("clicks", 0)),
                    "impressions": int(row.get("impressions", 0)),
                    "ctr": round(row.get("ctr", 0), 4),
                    "position": round(row.get("position", 0), 2),
                })
                all_rows.append(row_dict)
            if len(rows) < row_limit:
                break
            start_row += row_limit
        return all_rows

    def sync_all_data(
        self,
        db_path: str,
        property_id: int,
        days: int = 90,
    ) -> None:
        """Sync GSC data for a property into the database."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            cur = conn.execute("SELECT site_url FROM gsc_properties WHERE id=?", (property_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Property {property_id} not found. Run 'gsc connect' first.")
            site_url = row[0]
        finally:
            conn.close()

        end_date = date.today().isoformat()
        start_date = (date.today() - timedelta(days=days)).isoformat()
        print(f"Syncing GSC data for {site_url} ({start_date} to {end_date})...", flush=True)
        rows = self.fetch_performance_data(site_url, start_date, end_date)
        print(f"  Fetched {len(rows)} rows.")

        conn = get_connection(db_path)
        write_gsc_data(conn, property_id, rows)
        conn.execute(
            "UPDATE gsc_properties SET last_synced_at=datetime('now') WHERE id=?",
            (property_id,),
        )
        conn.commit()
        conn.close()
        print("Sync complete.")

    def get_top_queries(self, db_path: str, property_id: int, limit: int = 100) -> list[dict]:
        """Return top queries by clicks from stored GSC data."""
        conn = get_connection(db_path)
        try:
            cur = conn.execute(
                """SELECT query, SUM(clicks) as total_clicks, SUM(impressions) as total_impressions,
                          AVG(ctr) as avg_ctr, AVG(position) as avg_position
                   FROM gsc_data WHERE property_id=?
                   GROUP BY query ORDER BY total_clicks DESC LIMIT ?""",
                (property_id, limit),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def get_top_pages(self, db_path: str, property_id: int, limit: int = 100) -> list[dict]:
        """Return top pages by clicks from stored GSC data."""
        conn = get_connection(db_path)
        try:
            cur = conn.execute(
                """SELECT page, SUM(clicks) as total_clicks, SUM(impressions) as total_impressions,
                          AVG(ctr) as avg_ctr, AVG(position) as avg_position
                   FROM gsc_data WHERE property_id=?
                   GROUP BY page ORDER BY total_clicks DESC LIMIT ?""",
                (property_id, limit),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def detect_cannibalization(self, db_path: str, property_id: int) -> list[dict]:
        """Detect keyword cannibalization: multiple pages competing for same query."""
        conn = get_connection(db_path)
        try:
            cur = conn.execute(
                """SELECT query, COUNT(DISTINCT page) as page_count,
                          GROUP_CONCAT(DISTINCT page) as pages
                   FROM gsc_data WHERE property_id=?
                   GROUP BY query HAVING page_count > 1
                   ORDER BY page_count DESC LIMIT 100""",
                (property_id,),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def find_low_hanging_fruit(self, db_path: str, property_id: int) -> list[dict]:
        """Find queries with high impressions but low CTR (positions 4-20 with ctr < 5%).

        These are optimization opportunities to improve rankings slightly for big traffic gains.
        """
        conn = get_connection(db_path)
        try:
            cur = conn.execute(
                """SELECT query, page, SUM(clicks) as clicks, SUM(impressions) as impressions,
                          AVG(ctr) as avg_ctr, AVG(position) as avg_position
                   FROM gsc_data WHERE property_id=?
                   GROUP BY query, page
                   HAVING avg_position BETWEEN 4 AND 20
                      AND impressions > 100
                      AND avg_ctr < 0.05
                   ORDER BY impressions DESC LIMIT 50""",
                (property_id,),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def detect_content_decay(self, db_path: str, property_id: int) -> list[dict]:
        """Detect pages losing clicks over time by comparing recent vs older data."""
        conn = get_connection(db_path)
        try:
            cur = conn.execute(
                """SELECT page,
                          SUM(CASE WHEN date >= date('now', '-30 days') THEN clicks ELSE 0 END) as recent_clicks,
                          SUM(CASE WHEN date < date('now', '-30 days') AND date >= date('now', '-60 days') THEN clicks ELSE 0 END) as older_clicks
                   FROM gsc_data WHERE property_id=?
                   GROUP BY page
                   HAVING older_clicks > 10 AND recent_clicks < older_clicks * 0.7
                   ORDER BY (older_clicks - recent_clicks) DESC LIMIT 50""",
                (property_id,),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                r["decline_pct"] = round(
                    (1 - r["recent_clicks"] / max(r["older_clicks"], 1)) * 100, 1
                )
            return rows
        except Exception:
            return []
        finally:
            conn.close()

    def export_to_looker_studio(
        self, db_path: str, property_id: int, output_file: str
    ) -> None:
        """Export GSC data to CSV for Looker Studio / Google Sheets import."""
        conn = get_connection(db_path)
        data = read_gsc_data(conn, property_id, days=90)
        conn.close()

        if not data:
            print("No data to export.")
            return

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        print(f"Exported {len(data)} rows to {output_file}")

    def export_to_sheets(
        self, db_path: str, property_id: int, spreadsheet_id: str
    ) -> None:
        """Export GSC data to a Google Sheets spreadsheet."""
        conn = get_connection(db_path)
        data = read_gsc_data(conn, property_id, days=90)
        conn.close()

        if not data:
            print("No data to export.")
            return
        try:
            from googleapiclient.discovery import build
            service = self._get_service()
            # Use Sheets API
            sheets_service = build("sheets", "v4", credentials=service._http.credentials)
            headers = list(data[0].keys())
            values = [headers] + [[str(r.get(h, "")) for h in headers] for r in data]
            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="Sheet1!A1",
                valueInputOption="RAW",
                body={"values": values},
            ).execute()
            print(f"Exported {len(data)} rows to Google Sheet {spreadsheet_id}")
        except Exception as exc:
            print(f"Sheets export error: {exc}")


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def cmd_connect(db_path: str, credentials_file: str) -> None:
    """Register a GSC property in the database."""
    client = GSCClient(credentials_file)
    try:
        properties = client.get_properties()
    except Exception as exc:
        print(f"Authentication error: {exc}")
        return

    print("Verified properties:")
    for i, prop in enumerate(properties, 1):
        print(f"  {i}. {prop}")

    conn = get_connection(db_path)
    init_extended_schema(conn)
    for prop in properties:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO gsc_properties (site_url) VALUES (?)",
                (prop,),
            )
        except Exception:
            pass
    conn.commit()

    cur = conn.execute("SELECT id, site_url FROM gsc_properties ORDER BY id")
    for row in cur.fetchall():
        print(f"  Property ID {row[0]}: {row[1]}")
    conn.close()


def cmd_sync(db_path: str, property_id: int, days: int = 90) -> None:
    """Sync GSC data for a property."""
    client = GSCClient()
    try:
        client.sync_all_data(db_path, property_id, days)
    except Exception as exc:
        print(f"Sync error: {exc}")


def cmd_report(db_path: str, property_id: int) -> None:
    """Print GSC performance report."""
    client = GSCClient()
    print(f"\nGSC Report - Property {property_id}")
    print("=" * 60)

    print("\nTop 10 Queries:")
    for q in client.get_top_queries(db_path, property_id, 10):
        print(f"  {q['query']:<40} clicks={q['total_clicks']:>6} pos={q['avg_position']:.1f}")

    print("\nTop 10 Pages:")
    for p in client.get_top_pages(db_path, property_id, 10):
        print(f"  {str(p['page'])[:50]:<52} clicks={p['total_clicks']:>6}")

    print("\nLow-Hanging Fruit (improve rankings for big gains):")
    for l in client.find_low_hanging_fruit(db_path, property_id)[:10]:
        print(f"  pos={l['avg_position']:.1f} imp={l['impressions']:>6} {l['query'][:50]}")

    print("\nContent Decay (pages losing traffic):")
    for d in client.detect_content_decay(db_path, property_id)[:10]:
        print(f"  -{d['decline_pct']}%  {str(d['page'])[:60]}")

    print("\nCannibalization Issues:")
    for c in client.detect_cannibalization(db_path, property_id)[:10]:
        print(f"  {c['query']:<40} {c['page_count']} pages")


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for gsc command."""
    parser = argparse.ArgumentParser(description="Google Search Console Integration")
    parser.add_argument("subcommand", choices=["connect", "sync", "report"])
    parser.add_argument("--db", default="report.db")
    parser.add_argument("--credentials", default=_GOOGLE_CREDS_FILE)
    parser.add_argument("--property-id", type=int, default=1, dest="property_id")
    parser.add_argument("--days", type=int, default=90)
    parsed = parser.parse_args(args)

    if parsed.subcommand == "connect":
        if not parsed.credentials:
            print("Provide --credentials path to Google credentials JSON", file=sys.stderr)
            return 1
        cmd_connect(parsed.db, parsed.credentials)
    elif parsed.subcommand == "sync":
        cmd_sync(parsed.db, parsed.property_id, parsed.days)
    elif parsed.subcommand == "report":
        cmd_report(parsed.db, parsed.property_id)
    return 0
