"""Server log analysis: parse Apache/Nginx/Cloudflare logs, identify bots, analyze crawl budget."""
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


# Known bot user-agent patterns
KNOWN_BOTS = {
    "Googlebot": re.compile(r"Googlebot", re.I),
    "Bingbot": re.compile(r"bingbot", re.I),
    "Ahrefsbot": re.compile(r"AhrefsBot", re.I),
    "Semrushbot": re.compile(r"SemrushBot", re.I),
    "Moz": re.compile(r"DotBot|rogerbot", re.I),
    "Majestic": re.compile(r"MJ12bot", re.I),
    "DuckDuckBot": re.compile(r"DuckDuckBot", re.I),
    "YandexBot": re.compile(r"YandexBot", re.I),
    "Baiduspider": re.compile(r"Baiduspider", re.I),
    "FacebookBot": re.compile(r"facebookexternalhit", re.I),
    "TwitterBot": re.compile(r"Twitterbot", re.I),
    "Slackbot": re.compile(r"Slackbot", re.I),
}

# Log format regex patterns
LOG_FORMATS = {
    "apache_combined": re.compile(
        r'(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" '
        r'(?P<status>\d{3}) (?P<size>\S+)(?: "(?P<referrer>[^"]*)" "(?P<ua>[^"]*)")?'
    ),
    "nginx": re.compile(
        r'(?P<ip>\S+) - \S+ \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" '
        r'(?P<status>\d{3}) (?P<size>\d+)(?: "(?P<referrer>[^"]*)" "(?P<ua>[^"]*)")?'
    ),
    "cloudflare": re.compile(
        r'(?P<time>\S+) (?P<ip>\S+) (?P<method>\S+) (?P<path>\S+) (?P<status>\d{3}) (?P<size>\d+)'
    ),
}


def detect_bot(user_agent: str) -> Optional[str]:
    """Return known bot name or None."""
    for name, pattern in KNOWN_BOTS.items():
        if pattern.search(user_agent):
            return name
    return None


def parse_log_line(line: str) -> Optional[dict]:
    """Parse a single log line using all known formats."""
    for fmt_name, pattern in LOG_FORMATS.items():
        m = pattern.match(line.strip())
        if m:
            d = m.groupdict()
            ua = d.get("ua", "")
            bot_name = detect_bot(ua) if ua else None
            return {
                "ip": d.get("ip", ""),
                "time": d.get("time", ""),
                "method": d.get("method", "GET"),
                "path": d.get("path", "/"),
                "status": int(d.get("status", 0)),
                "size": int(d.get("size", 0)) if d.get("size", "").isdigit() else 0,
                "referrer": d.get("referrer", ""),
                "user_agent": ua,
                "is_bot": bot_name is not None,
                "bot_name": bot_name or "",
                "log_format": fmt_name,
            }
    return None


class LogAnalyzer:
    """Analyze web server logs for SEO insights."""

    def parse_file(self, log_path: str, max_lines: int = None) -> list:
        """Parse a log file and return list of parsed request dicts."""
        records = []
        errors = 0
        path = Path(log_path)
        if not path.exists():
            print(f"Log file not found: {log_path}")
            return []

        opener = __import__("gzip").open if str(log_path).endswith(".gz") else open
        try:
            with opener(log_path, "rt", encoding="utf-8", errors="replace") as f:
                for i, line in enumerate(f):
                    if max_lines and i >= max_lines:
                        break
                    record = parse_log_line(line)
                    if record:
                        records.append(record)
                    else:
                        errors += 1
        except Exception as e:
            print(f"  Error reading {log_path}: {e}")

        print(f"  Parsed {len(records):,} records ({errors:,} unparseable lines)")
        return records

    def to_dataframe(self, records: list):
        """Convert records list to pandas DataFrame."""
        try:
            import pandas as pd
            return pd.DataFrame(records)
        except ImportError:
            raise ImportError("pandas required: pip install pandas")

    def crawl_budget_analysis(self, records: list) -> dict:
        """Analyze Googlebot crawl budget usage."""
        try:
            import pandas as pd
        except ImportError:
            return {"error": "pandas required"}

        df = pd.DataFrame(records)
        if df.empty:
            return {"total_requests": 0}

        googlebot_df = df[df["bot_name"] == "Googlebot"]
        total = len(df)
        bot_total = len(df[df["is_bot"]])
        google_total = len(googlebot_df)

        pages_crawled = googlebot_df[googlebot_df["method"] == "GET"]["path"].nunique() if not googlebot_df.empty else 0
        status_dist = googlebot_df["status"].value_counts().to_dict() if not googlebot_df.empty else {}
        most_crawled = (
            googlebot_df.groupby("path").size().sort_values(ascending=False).head(10).to_dict()
            if not googlebot_df.empty else {}
        )
        wasted = googlebot_df[googlebot_df["status"].isin([301, 302, 404, 410])]["path"].nunique() if not googlebot_df.empty else 0

        return {
            "total_requests": total,
            "human_requests": total - bot_total,
            "bot_requests": bot_total,
            "googlebot_requests": google_total,
            "unique_pages_crawled_by_google": pages_crawled,
            "wasted_crawl_budget_urls": wasted,
            "status_distribution": status_dist,
            "most_crawled_urls": most_crawled,
        }

    def bot_analysis(self, records: list) -> dict:
        """Summarize all bot activity."""
        try:
            import pandas as pd
        except ImportError:
            return {"error": "pandas required"}

        df = pd.DataFrame(records)
        if df.empty:
            return {}

        bots_df = df[df["is_bot"]]
        bot_counts = bots_df.groupby("bot_name").size().sort_values(ascending=False).to_dict()
        return {
            "total_bot_requests": len(bots_df),
            "total_human_requests": len(df) - len(bots_df),
            "bot_breakdown": bot_counts,
            "bot_percentage": round(len(bots_df) / len(df) * 100, 1) if len(df) > 0 else 0,
        }

    def top_pages(self, records: list, n: int = 20, exclude_bots: bool = True) -> list:
        """Return top N most requested pages."""
        try:
            import pandas as pd
        except ImportError:
            return []

        df = pd.DataFrame(records)
        if df.empty:
            return []

        if exclude_bots:
            df = df[~df["is_bot"]]
        top = df.groupby("path").size().sort_values(ascending=False).head(n)
        return [{"path": path, "requests": int(count)} for path, count in top.items()]

    def error_pages(self, records: list) -> dict:
        """Find pages returning 4xx/5xx errors."""
        try:
            import pandas as pd
        except ImportError:
            return {}

        df = pd.DataFrame(records)
        if df.empty:
            return {}

        errors_df = df[df["status"] >= 400]
        status_groups = errors_df.groupby("status")["path"].apply(lambda x: x.value_counts().head(5).to_dict()).to_dict()
        return {str(k): v for k, v in status_groups.items()}

    def traffic_by_hour(self, records: list) -> dict:
        """Count requests by hour of day."""
        hour_counts = {}
        for r in records:
            try:
                time_str = r.get("time", "")
                # Apache format: 21/Mar/2026:14:30:00 +0000
                if ":" in time_str:
                    hour = int(time_str.split(":")[1]) if "/" in time_str else int(time_str[11:13])
                    hour_counts[hour] = hour_counts.get(hour, 0) + 1
            except Exception:
                pass
        return dict(sorted(hour_counts.items()))

    def save_to_db(self, db_path: str, site_id: str, records: list) -> int:
        """Save parsed log records to analytics_events table."""
        from src.db import get_connection, write_analytics_event
        conn = get_connection(db_path)
        saved = 0
        for r in records:
            try:
                write_analytics_event(conn, {
                    "site_id": site_id,
                    "timestamp": r.get("time", ""),
                    "page_url": r.get("path", ""),
                    "referrer": r.get("referrer", ""),
                    "user_agent": r.get("user_agent", ""),
                    "event_type": "pageview",
                    "is_bot": int(r.get("is_bot", False)),
                    "bot_name": r.get("bot_name", ""),
                })
                saved += 1
            except Exception:
                pass
        conn.close()
        return saved


def cmd_analyze(log_path: str, output_format: str = "text"):
    """Analyze a log file and print summary."""
    analyzer = LogAnalyzer()
    print(f"Parsing log file: {log_path}")
    records = analyzer.parse_file(log_path)
    if not records:
        print("  No records parsed.")
        return

    crawl = analyzer.crawl_budget_analysis(records)
    bots = analyzer.bot_analysis(records)
    top = analyzer.top_pages(records, n=10)
    errors = analyzer.error_pages(records)

    print(f"\n{'='*50}")
    print("CRAWL BUDGET ANALYSIS")
    print(f"{'='*50}")
    print(f"Total Requests     : {crawl.get('total_requests', 0):,}")
    print(f"Googlebot Requests : {crawl.get('googlebot_requests', 0):,}")
    print(f"Unique Pages Crawled: {crawl.get('unique_pages_crawled_by_google', 0):,}")
    print(f"Wasted Crawl Budget : {crawl.get('wasted_crawl_budget_urls', 0):,} URLs (4xx/3xx)")

    print(f"\n{'='*50}")
    print("BOT ANALYSIS")
    print(f"{'='*50}")
    print(f"Bot Traffic: {bots.get('bot_percentage', 0):.1f}%")
    for bot, count in list(bots.get("bot_breakdown", {}).items())[:8]:
        print(f"  {bot:<20}: {count:,}")

    print(f"\n{'='*50}")
    print("TOP PAGES (human traffic)")
    print(f"{'='*50}")
    for p in top:
        print(f"  {p['requests']:>6,}  {p['path']}")

    if errors:
        print(f"\n{'='*50}")
        print("ERROR PAGES")
        print(f"{'='*50}")
        for status, pages in errors.items():
            print(f"  HTTP {status}:")
            for path, count in list(pages.items())[:3]:
                print(f"    {count:>5,}  {path}")


def cmd_save(db_path: str, log_path: str, site_id: str):
    """Parse log file and save to DB analytics_events table."""
    analyzer = LogAnalyzer()
    print(f"Parsing and saving log: {log_path}")
    records = analyzer.parse_file(log_path)
    if not records:
        return
    saved = analyzer.save_to_db(db_path, site_id, records)
    print(f"  Saved {saved:,} events to DB for site_id='{site_id}'")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Server Log Analyzer")
    sub = parser.add_subparsers(dest="cmd")

    analyze_p = sub.add_parser("analyze", help="Analyze a log file and print report")
    analyze_p.add_argument("log_file")

    save_p = sub.add_parser("save", help="Parse log and save to analytics DB")
    save_p.add_argument("log_file")
    save_p.add_argument("--site-id", default="default")

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "analyze":
        cmd_analyze(parsed.log_file)
    elif parsed.cmd == "save":
        cmd_save(db, parsed.log_file, parsed.site_id)
    else:
        parser.print_help()
