"""Alert management: check conditions and send notifications."""
import json
import os
import smtplib
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


class AlertManager:
    """Check all configured alert conditions against current data."""

    def check_all(self, db_path: str) -> list:
        """Check every active alert and return list of triggered alerts."""
        from src.db import get_connection, read_alerts
        conn = get_connection(db_path)
        alerts = read_alerts(conn)
        conn.close()
        triggered = []
        for alert in alerts:
            result = self.check_alert(db_path, alert)
            if result.get("triggered"):
                triggered.append(result)
        return triggered

    def check_alert(self, db_path: str, alert: dict) -> dict:
        """Check a single alert condition."""
        alert_type = alert.get("type", "")
        config = alert.get("config", {})
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except Exception:
                config = {}

        handlers = {
            "rank_drop": self._check_rank_drop,
            "rank_gain": self._check_rank_gain,
            "traffic_drop": self._check_traffic_drop,
            "new_backlink": self._check_new_backlinks,
            "lost_backlink": self._check_lost_backlinks,
            "keyword_position": self._check_keyword_position,
        }
        handler = handlers.get(alert_type)
        if handler:
            return handler(db_path, alert, config)
        return {"triggered": False, "alert": alert, "reason": f"Unknown type: {alert_type}"}

    def _check_rank_drop(self, db_path: str, alert: dict, config: dict) -> dict:
        """Trigger if any keyword dropped by >= threshold positions."""
        from src.db import get_connection, read_rank_history
        threshold = config.get("threshold", 5)
        project_id = alert.get("project_id")
        conn = get_connection(db_path)
        history = read_rank_history(conn, days=2)
        conn.close()
        drops = []
        for entry in history:
            prev = entry.get("previous_position")
            curr = entry.get("position")
            if prev and curr and (curr - prev) >= threshold:
                drops.append({"keyword_id": entry["tracked_keyword_id"], "drop": curr - prev, "current": curr, "previous": prev})
        triggered = len(drops) > 0
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "rank_drop",
            "data": drops,
            "message": f"{len(drops)} keyword(s) dropped by {threshold}+ positions" if triggered else "",
        }

    def _check_rank_gain(self, db_path: str, alert: dict, config: dict) -> dict:
        """Trigger if any keyword gained >= threshold positions."""
        from src.db import get_connection, read_rank_history
        threshold = config.get("threshold", 5)
        conn = get_connection(db_path)
        history = read_rank_history(conn, days=2)
        conn.close()
        gains = []
        for entry in history:
            prev = entry.get("previous_position")
            curr = entry.get("position")
            if prev and curr and (prev - curr) >= threshold:
                gains.append({"keyword_id": entry["tracked_keyword_id"], "gain": prev - curr, "current": curr, "previous": prev})
        triggered = len(gains) > 0
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "rank_gain",
            "data": gains,
            "message": f"{len(gains)} keyword(s) gained {threshold}+ positions" if triggered else "",
        }

    def _check_traffic_drop(self, db_path: str, alert: dict, config: dict) -> dict:
        """Trigger if traffic dropped by >= threshold% compared to previous period."""
        from src.db import get_connection, read_analytics_summary
        site_id = config.get("site_id", "default")
        threshold_pct = config.get("threshold_pct", 20)
        conn = get_connection(db_path)
        current = read_analytics_summary(conn, site_id, days=7)
        previous = read_analytics_summary(conn, site_id, days=14)
        conn.close()
        curr_sessions = current.get("sessions", 0) or 0
        prev_half = (previous.get("sessions", 0) or 0) / 2
        if prev_half == 0:
            return {"triggered": False, "alert": alert, "type": "traffic_drop"}
        drop_pct = ((prev_half - curr_sessions) / prev_half) * 100
        triggered = drop_pct >= threshold_pct
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "traffic_drop",
            "data": {"drop_pct": round(drop_pct, 1), "current_sessions": curr_sessions, "previous_avg": round(prev_half)},
            "message": f"Traffic dropped by {drop_pct:.1f}% (threshold: {threshold_pct}%)" if triggered else "",
        }

    def _check_new_backlinks(self, db_path: str, alert: dict, config: dict) -> dict:
        """Check for newly discovered backlinks."""
        from src.db import get_connection, read_backlinks
        domain = config.get("domain", "")
        conn = get_connection(db_path)
        backlinks = read_backlinks(conn, domain)
        conn.close()
        today = date.today().isoformat()
        new_links = [b for b in backlinks if b.get("first_seen", "") >= today]
        triggered = len(new_links) > 0
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "new_backlink",
            "data": new_links[:10],
            "message": f"{len(new_links)} new backlink(s) found for {domain}" if triggered else "",
        }

    def _check_lost_backlinks(self, db_path: str, alert: dict, config: dict) -> dict:
        """Check for broken/lost backlinks."""
        from src.db import get_connection, read_backlinks
        domain = config.get("domain", "")
        conn = get_connection(db_path)
        backlinks = read_backlinks(conn, domain)
        conn.close()
        broken = [b for b in backlinks if b.get("is_broken", 0)]
        triggered = len(broken) > 0
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "lost_backlink",
            "data": broken[:10],
            "message": f"{len(broken)} broken/lost backlink(s) for {domain}" if triggered else "",
        }

    def _check_keyword_position(self, db_path: str, alert: dict, config: dict) -> dict:
        """Trigger if a specific keyword hits a target position."""
        from src.db import get_connection, read_rank_history
        keyword_id = config.get("keyword_id")
        target_position = config.get("target_position", 10)
        conn = get_connection(db_path)
        history = read_rank_history(conn, keyword_id=keyword_id, days=1)
        conn.close()
        if not history:
            return {"triggered": False, "alert": alert, "type": "keyword_position"}
        latest = history[0]
        position = latest.get("position", 999)
        triggered = position <= target_position
        return {
            "triggered": triggered,
            "alert": alert,
            "type": "keyword_position",
            "data": {"position": position, "target": target_position},
            "message": f"Keyword reached position {position} (target: top {target_position})" if triggered else "",
        }

    def create_alert(self, db_path: str, name: str, alert_type: str, config: dict,
                      channels: dict, project_id: int = 1) -> int:
        """Create and save a new alert rule."""
        from src.db import get_connection, write_alert
        conn = get_connection(db_path)
        alert_id = write_alert(conn, {
            "project_id": project_id,
            "name": name,
            "type": alert_type,
            "config": config,
            "channels": channels,
        })
        conn.close()
        return alert_id


class NotificationSender:
    """Send alert notifications via email and Slack."""

    def send(self, triggered_alert: dict) -> dict:
        """Send notification for a triggered alert through configured channels."""
        alert = triggered_alert.get("alert", {})
        channels = alert.get("channels", {})
        if isinstance(channels, str):
            try:
                channels = json.loads(channels)
            except Exception:
                channels = {}

        results = {}
        if channels.get("email"):
            results["email"] = self.send_email(
                to=channels["email"],
                subject=f"Alert: {alert.get('name', 'SEO Alert')}",
                body=triggered_alert.get("message", "An alert was triggered."),
            )
        if channels.get("slack"):
            results["slack"] = self.send_slack(
                webhook_url=channels["slack"],
                message=triggered_alert.get("message", "An alert was triggered."),
                alert_name=alert.get("name", "SEO Alert"),
            )
        return results

    def send_email(self, to: str, subject: str, body: str) -> dict:
        """Send email notification via SMTP."""
        smtp_host = os.getenv("SMTP_HOST", "")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_pass = os.getenv("SMTP_PASS", "")
        from_addr = os.getenv("ALERT_FROM_EMAIL", smtp_user)

        if not smtp_host or not smtp_user:
            return {"status": "skipped", "reason": "SMTP_HOST/SMTP_USER not configured"}
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = to
            msg.attach(MIMEText(body, "plain"))
            msg.attach(MIMEText(f"<html><body><p>{body}</p></body></html>", "html"))
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_addr, [to], msg.as_string())
            return {"status": "sent", "to": to}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def send_slack(self, webhook_url: str, message: str, alert_name: str = "SEO Alert") -> dict:
        """Send Slack notification via webhook."""
        if not webhook_url:
            slack_webhook = os.getenv("SLACK_WEBHOOK_URL", "")
            if not slack_webhook:
                return {"status": "skipped", "reason": "SLACK_WEBHOOK_URL not configured"}
            webhook_url = slack_webhook
        try:
            import httpx
            payload = {
                "text": f":warning: *{alert_name}*\n{message}",
                "username": "WebsiteProfiling Alerts",
                "icon_emoji": ":bar_chart:",
            }
            with httpx.Client(timeout=10) as client:
                resp = client.post(webhook_url, json=payload)
            if resp.status_code == 200:
                return {"status": "sent"}
            return {"status": "error", "reason": resp.text}
        except Exception as e:
            return {"status": "error", "reason": str(e)}


def cmd_check(db_path: str, notify: bool = False):
    """Check all alerts and optionally send notifications."""
    from src.db import get_connection, write_alert_history
    manager = AlertManager()
    sender = NotificationSender()
    print("Checking all alerts...")
    triggered = manager.check_all(db_path)
    if not triggered:
        print("  No alerts triggered.")
        return
    print(f"  {len(triggered)} alert(s) triggered:")
    conn = get_connection(db_path)
    for t in triggered:
        alert = t.get("alert", {})
        print(f"  [{alert.get('type', '?')}] {alert.get('name', '?')}: {t.get('message', '')}")
        write_alert_history(conn, alert.get("id", 0), t)
        if notify:
            results = sender.send(t)
            for channel, result in results.items():
                print(f"    Notified via {channel}: {result.get('status', '?')}")
    conn.close()


def cmd_create(db_path: str, name: str, alert_type: str, config_json: str,
                channels_json: str, project_id: int = 1):
    try:
        config = json.loads(config_json)
    except Exception:
        print(f"Invalid config JSON: {config_json}")
        return
    try:
        channels = json.loads(channels_json)
    except Exception:
        channels = {}
    manager = AlertManager()
    alert_id = manager.create_alert(db_path, name, alert_type, config, channels, project_id)
    print(f"Alert '{name}' created (id={alert_id})")


def cmd_list(db_path: str):
    from src.db import get_connection, read_alerts
    conn = get_connection(db_path)
    alerts = read_alerts(conn)
    conn.close()
    print(f"Active alerts: {len(alerts)}")
    for a in alerts:
        print(f"  id={a['id']}  [{a['type']:20}] {a['name']}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Alert Management")
    sub = parser.add_subparsers(dest="cmd")

    chk_p = sub.add_parser("check", help="Check all alerts")
    chk_p.add_argument("--notify", action="store_true", help="Send notifications for triggered alerts")

    cre_p = sub.add_parser("create", help="Create a new alert")
    cre_p.add_argument("--name", required=True)
    cre_p.add_argument("--type", required=True, dest="alert_type",
                        choices=["rank_drop", "rank_gain", "traffic_drop", "new_backlink", "lost_backlink", "keyword_position"])
    cre_p.add_argument("--config", required=True, help='JSON config e.g. {"threshold":5}')
    cre_p.add_argument("--channels", default="{}", help='JSON channels e.g. {"email":"me@example.com"}')
    cre_p.add_argument("--project-id", type=int, default=1)

    sub.add_parser("list", help="List all active alerts")

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "check":
        cmd_check(db, parsed.notify)
    elif parsed.cmd == "create":
        cmd_create(db, parsed.name, parsed.alert_type, parsed.config, parsed.channels, parsed.project_id)
    elif parsed.cmd == "list":
        cmd_list(db)
    else:
        parser.print_help()
