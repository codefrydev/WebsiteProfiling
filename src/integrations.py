"""Third-party integrations: Google Sheets, Looker Studio, Webhooks, Slack."""
import json
import os
from datetime import datetime
from typing import Optional


class GoogleSheetsExporter:
    """Export data to Google Sheets."""

    def get_service(self, credentials_file: str = None):
        """Build authenticated Google Sheets service."""
        try:
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            raise ImportError("google-api-python-client required: pip install google-api-python-client google-auth")

        creds_file = credentials_file or os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
        if not creds_file or not os.path.isfile(creds_file):
            raise FileNotFoundError(
                "Google service account credentials not found. "
                "Set GOOGLE_SERVICE_ACCOUNT_FILE or pass credentials_file."
            )
        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
        creds = Credentials.from_service_account_file(creds_file, scopes=scopes)
        return build("sheets", "v4", credentials=creds)

    def export_rank_history(self, db_path: str, spreadsheet_id: str,
                             sheet_name: str = "Rank History", credentials_file: str = None) -> dict:
        """Export rank history to a Google Sheets spreadsheet."""
        from src.db import get_connection, read_rank_history, read_tracked_keywords
        conn = get_connection(db_path)
        keywords = {kw["id"]: kw["keyword"] for kw in read_tracked_keywords(conn)}
        history = read_rank_history(conn, days=30)
        conn.close()

        headers = ["Keyword", "Date", "Position", "Previous Position", "URL"]
        rows = [headers]
        for h in history:
            kw_name = keywords.get(h.get("tracked_keyword_id"), str(h.get("tracked_keyword_id")))
            rows.append([kw_name, h.get("date", ""), h.get("position", ""), h.get("previous_position", ""), h.get("url", "")])

        return self._write_to_sheet(spreadsheet_id, sheet_name, rows, credentials_file)

    def export_keywords(self, db_path: str, spreadsheet_id: str,
                         sheet_name: str = "Keywords", credentials_file: str = None) -> dict:
        """Export tracked keywords to Google Sheets."""
        from src.db import get_connection, read_tracked_keywords
        conn = get_connection(db_path)
        keywords = read_tracked_keywords(conn)
        conn.close()

        headers = ["ID", "Keyword", "Location", "Device", "Language"]
        rows = [headers] + [[kw.get("id"), kw.get("keyword"), kw.get("location"), kw.get("device"), kw.get("language")] for kw in keywords]
        return self._write_to_sheet(spreadsheet_id, sheet_name, rows, credentials_file)

    def _write_to_sheet(self, spreadsheet_id: str, sheet_name: str, rows: list, credentials_file: str = None) -> dict:
        try:
            service = self.get_service(credentials_file)
            range_notation = f"{sheet_name}!A1"
            body = {"values": rows}
            result = service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=range_notation,
                valueInputOption="RAW",
                body=body,
            ).execute()
            return {"status": "success", "updated_cells": result.get("updatedCells", 0)}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def create_spreadsheet(self, title: str, credentials_file: str = None) -> str:
        """Create a new Google Sheets spreadsheet and return its ID."""
        try:
            service = self.get_service(credentials_file)
            spreadsheet = {"properties": {"title": title}}
            result = service.spreadsheets().create(body=spreadsheet, fields="spreadsheetId").execute()
            return result.get("spreadsheetId", "")
        except Exception as e:
            print(f"  Error creating spreadsheet: {e}")
            return ""


class LookerStudioExporter:
    """Export data as CSVs compatible with Looker Studio (Google Data Studio)."""

    def export_rankings_csv(self, db_path: str, output_path: str = "looker_rankings.csv") -> str:
        """Export rankings data as CSV for Looker Studio."""
        try:
            import pandas as pd
            from src.db import get_connection, read_rank_history, read_tracked_keywords
            conn = get_connection(db_path)
            keywords = {kw["id"]: kw["keyword"] for kw in read_tracked_keywords(conn)}
            history = read_rank_history(conn, days=90)
            conn.close()
            rows = []
            for h in history:
                rows.append({
                    "keyword": keywords.get(h.get("tracked_keyword_id"), ""),
                    "date": h.get("date"),
                    "position": h.get("position"),
                    "previous_position": h.get("previous_position"),
                    "url": h.get("url"),
                    "visibility_score": h.get("visibility_score"),
                })
            df = pd.DataFrame(rows)
            df.to_csv(output_path, index=False)
            return output_path
        except Exception as e:
            print(f"  CSV export error: {e}")
            return ""

    def export_analytics_csv(self, db_path: str, site_id: str,
                               output_path: str = "looker_analytics.csv") -> str:
        """Export analytics events as CSV for Looker Studio."""
        try:
            import pandas as pd
            import sqlite3
            conn = sqlite3.connect(db_path)
            df = pd.read_sql(
                "SELECT * FROM analytics_events WHERE site_id=? AND timestamp >= datetime('now', '-90 days')",
                conn,
                params=(site_id,),
            )
            conn.close()
            df.to_csv(output_path, index=False)
            return output_path
        except Exception as e:
            print(f"  Analytics CSV export error: {e}")
            return ""

    def export_backlinks_csv(self, db_path: str, domain: str,
                              output_path: str = "looker_backlinks.csv") -> str:
        """Export backlink data as CSV for Looker Studio."""
        try:
            import pandas as pd
            from src.db import get_connection, read_backlinks
            conn = get_connection(db_path)
            backlinks = read_backlinks(conn, domain)
            conn.close()
            df = pd.DataFrame(backlinks)
            df.to_csv(output_path, index=False)
            return output_path
        except Exception as e:
            print(f"  Backlinks CSV export error: {e}")
            return ""


class WebhookNotifier:
    """Send data to webhook endpoints."""

    def send(self, url: str, payload: dict, headers: dict = None, method: str = "POST") -> dict:
        """Send JSON payload to a webhook URL."""
        try:
            import httpx
            default_headers = {"Content-Type": "application/json"}
            if headers:
                default_headers.update(headers)
            with httpx.Client(timeout=15) as client:
                if method.upper() == "POST":
                    resp = client.post(url, json=payload, headers=default_headers)
                else:
                    resp = client.get(url, params=payload, headers=default_headers)
            return {"status": "sent" if resp.status_code < 300 else "error", "http_status": resp.status_code}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def send_rank_update(self, webhook_url: str, keyword: str, position: int,
                          previous_position: int = None, domain: str = "") -> dict:
        """Send a rank change webhook notification."""
        payload = {
            "event": "rank_update",
            "keyword": keyword,
            "position": position,
            "previous_position": previous_position,
            "change": (previous_position - position) if previous_position else None,
            "domain": domain,
            "timestamp": datetime.now().isoformat(),
        }
        return self.send(webhook_url, payload)

    def send_alert(self, webhook_url: str, alert_data: dict) -> dict:
        """Send an alert webhook notification."""
        payload = {
            "event": "alert_triggered",
            "alert": alert_data,
            "timestamp": datetime.now().isoformat(),
        }
        return self.send(webhook_url, payload)


class SlackIntegration:
    """Slack integration for reports and notifications."""

    def __init__(self, bot_token: str = None, webhook_url: str = None):
        self.bot_token = bot_token or os.getenv("SLACK_BOT_TOKEN", "")
        self.webhook_url = webhook_url or os.getenv("SLACK_WEBHOOK_URL", "")

    def post_message(self, channel: str, text: str, blocks: list = None) -> dict:
        """Post a message to a Slack channel."""
        if not self.bot_token:
            return {"status": "skipped", "reason": "SLACK_BOT_TOKEN not configured"}
        try:
            from slack_sdk import WebClient
            client = WebClient(token=self.bot_token)
            kwargs = {"channel": channel, "text": text}
            if blocks:
                kwargs["blocks"] = blocks
            resp = client.chat_postMessage(**kwargs)
            return {"status": "sent", "ts": resp.get("ts")}
        except ImportError:
            return {"status": "error", "reason": "slack_sdk not installed"}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def post_weekly_summary(self, db_path: str, channel: str) -> dict:
        """Post weekly SEO summary to Slack."""
        from src.db import get_connection, read_rank_history, read_analytics_summary
        conn = get_connection(db_path)
        history = read_rank_history(conn, days=7)
        analytics = read_analytics_summary(conn, "default", days=7)
        conn.close()

        top_10 = sum(1 for h in history if h.get("position", 99) <= 10)
        sessions = analytics.get("sessions", 0)
        text = (
            f"*Weekly SEO Summary*\n"
            f"• Keywords in Top 10: {top_10}\n"
            f"• Sessions this week: {sessions:,}\n"
            f"• Rank data points: {len(history)}"
        )
        return self.post_message(channel, text)

    def send_webhook(self, message: str, emoji: str = ":bar_chart:") -> dict:
        """Send a message via incoming webhook."""
        if not self.webhook_url:
            return {"status": "skipped", "reason": "SLACK_WEBHOOK_URL not configured"}
        try:
            import httpx
            payload = {"text": message, "icon_emoji": emoji, "username": "WebsiteProfiling"}
            with httpx.Client(timeout=10) as client:
                resp = client.post(self.webhook_url, json=payload)
            return {"status": "sent" if resp.status_code == 200 else "error", "http_status": resp.status_code}
        except Exception as e:
            return {"status": "error", "reason": str(e)}


def cmd_sheets_export(db_path: str, spreadsheet_id: str, data_type: str):
    exporter = GoogleSheetsExporter()
    print(f"Exporting {data_type} to Google Sheets ({spreadsheet_id})...")
    if data_type == "rankings":
        result = exporter.export_rank_history(db_path, spreadsheet_id)
    elif data_type == "keywords":
        result = exporter.export_keywords(db_path, spreadsheet_id)
    else:
        print(f"Unknown data type: {data_type}")
        return
    print(f"  Status: {result.get('status')} - {result.get('updated_cells', result.get('reason', ''))}")


def cmd_looker_export(db_path: str, output_dir: str = "."):
    exporter = LookerStudioExporter()
    print("Exporting CSVs for Looker Studio...")
    rankings_path = exporter.export_rankings_csv(db_path, os.path.join(output_dir, "looker_rankings.csv"))
    analytics_path = exporter.export_analytics_csv(db_path, "default", os.path.join(output_dir, "looker_analytics.csv"))
    if rankings_path:
        print(f"  Rankings CSV : {rankings_path}")
    if analytics_path:
        print(f"  Analytics CSV: {analytics_path}")


def cmd_webhook_test(url: str):
    notifier = WebhookNotifier()
    print(f"Testing webhook: {url}")
    result = notifier.send(url, {"event": "test", "message": "WebsiteProfiling webhook test", "timestamp": datetime.now().isoformat()})
    print(f"  Status: {result.get('status')} (HTTP {result.get('http_status', 'N/A')})")


def cmd_slack_summary(db_path: str, channel: str):
    slack = SlackIntegration()
    print(f"Posting weekly summary to Slack #{channel}...")
    result = slack.post_weekly_summary(db_path, channel)
    print(f"  Status: {result.get('status')} - {result.get('reason', result.get('ts', ''))}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Third-party Integrations")
    sub = parser.add_subparsers(dest="cmd")

    sheets_p = sub.add_parser("sheets", help="Export to Google Sheets")
    sheets_p.add_argument("--spreadsheet-id", required=True)
    sheets_p.add_argument("--data", default="rankings", choices=["rankings", "keywords"])

    looker_p = sub.add_parser("looker", help="Export CSVs for Looker Studio")
    looker_p.add_argument("--output-dir", default=".")

    webhook_p = sub.add_parser("webhook-test", help="Test a webhook endpoint")
    webhook_p.add_argument("--url", required=True)

    slack_p = sub.add_parser("slack-summary", help="Post weekly summary to Slack")
    slack_p.add_argument("--channel", default="seo-reports")

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "sheets":
        cmd_sheets_export(db, parsed.spreadsheet_id, parsed.data)
    elif parsed.cmd == "looker":
        cmd_looker_export(db, parsed.output_dir)
    elif parsed.cmd == "webhook-test":
        cmd_webhook_test(parsed.url)
    elif parsed.cmd == "slack-summary":
        cmd_slack_summary(db, parsed.channel)
    else:
        parser.print_help()
