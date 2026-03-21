"""
Privacy-first Web Analytics: cookie-free tracking script and server-side processing.

Usage:
    python -m src analytics import-log   --log access.log --site-id mysite
    python -m src analytics report       --site-id mysite --days 30
    python -m src analytics generate-script --site-id mysite --endpoint https://api.example.com/track
"""
from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import get_connection, init_extended_schema, write_analytics_event

# ---------------------------------------------------------------------------
# Bot / AI traffic signatures
# ---------------------------------------------------------------------------

_BOT_UA_PATTERNS = [
    r"Googlebot", r"bingbot", r"Slurp", r"DuckDuckBot", r"Baiduspider",
    r"YandexBot", r"facebookexternalhit", r"Twitterbot", r"LinkedInBot",
    r"WhatsApp", r"Applebot", r"Discordbot", r"TelegramBot", r"rogerbot",
    r"AhrefsBot", r"SemrushBot", r"MJ12bot", r"DotBot", r"GigaBot",
    r"PetalBot", r"GPTBot", r"ChatGPT-User", r"ClaudeBot", r"Anthropic",
    r"PerplexityBot", r"Bytespider", r"CCBot", r"DataForSeoBot",
]
_BOT_UA_RE = re.compile("|".join(_BOT_UA_PATTERNS), re.IGNORECASE)

_AI_REFERRERS = [
    "chat.openai.com", "chatgpt.com", "bard.google.com", "claude.ai",
    "perplexity.ai", "you.com", "phind.com", "poe.com", "character.ai",
    "bing.com/chat", "copilot.microsoft.com",
]

_AI_UA_PATTERNS = [r"GPTBot", r"ChatGPT", r"ClaudeBot", r"PerplexityBot", r"Bytespider"]
_AI_UA_RE = re.compile("|".join(_AI_UA_PATTERNS), re.IGNORECASE)

_TRAFFIC_CHANNELS = {
    "organic": {"sources": ["google", "bing", "yahoo", "duckduckgo", "baidu", "yandex"]},
    "social": {"sources": ["facebook", "twitter", "linkedin", "instagram", "pinterest", "tiktok", "reddit"]},
    "email": {"sources": ["mail", "email", "newsletter"]},
    "paid": {"utm_medium": ["cpc", "ppc", "paid", "paidsearch", "paidsocial"]},
    "referral": {},
    "direct": {},
}


class AnalyticsProcessor:
    """Process and analyze web analytics events."""

    def process_event(self, event: dict) -> dict:
        """Normalize raw event data, classify bot/device/browser/channel."""
        ua = event.get("user_agent", "")
        referrer = event.get("referrer", "")
        is_bot, bot_name = self.classify_bot(ua)
        event["is_bot"] = int(is_bot)
        event["bot_name"] = bot_name
        event["device"] = self._classify_device(ua)
        event["browser"] = self._classify_browser(ua)
        channel_info = self.classify_referrer(referrer)
        event.setdefault("source", channel_info.get("source", ""))
        event.setdefault("medium", channel_info.get("medium", ""))
        event.setdefault("channel", channel_info.get("channel", "direct"))
        return event

    def classify_referrer(self, referrer: str) -> dict:
        """Classify referrer URL into source, medium, and channel."""
        if not referrer:
            return {"source": "(direct)", "medium": "(none)", "channel": "direct"}

        referrer_lower = referrer.lower()

        # Check for AI referrers first
        for ai_site in _AI_REFERRERS:
            if ai_site in referrer_lower:
                return {"source": ai_site, "medium": "ai", "channel": "ai"}

        # Extract domain
        domain_match = re.search(r"(?:https?://)?(?:www\.)?([^/?\s]+)", referrer_lower)
        source_domain = domain_match.group(1) if domain_match else referrer_lower

        for channel, cfg in _TRAFFIC_CHANNELS.items():
            for src in cfg.get("sources", []):
                if src in source_domain:
                    medium = "organic" if channel == "organic" else channel
                    return {"source": source_domain, "medium": medium, "channel": channel}

        return {"source": source_domain, "medium": "referral", "channel": "referral"}

    def classify_bot(self, user_agent: str) -> tuple[bool, str]:
        """Classify whether a request is from a bot. Returns (is_bot, bot_name)."""
        if not user_agent:
            return True, "empty-ua"
        m = _BOT_UA_RE.search(user_agent)
        if m:
            return True, m.group(0)
        return False, ""

    def classify_ai_traffic(self, referrer: str, user_agent: str) -> bool:
        """Return True if the request appears to originate from an AI assistant."""
        if _AI_UA_RE.search(user_agent or ""):
            return True
        for ai_site in _AI_REFERRERS:
            if ai_site in (referrer or "").lower():
                return True
        return False

    def _classify_device(self, ua: str) -> str:
        ua_lower = ua.lower()
        if any(x in ua_lower for x in ["iphone", "android", "mobile", "blackberry"]):
            return "mobile"
        if any(x in ua_lower for x in ["ipad", "tablet"]):
            return "tablet"
        return "desktop"

    def _classify_browser(self, ua: str) -> str:
        if "Chrome" in ua and "Chromium" not in ua and "Edg" not in ua:
            return "Chrome"
        if "Firefox" in ua:
            return "Firefox"
        if "Safari" in ua and "Chrome" not in ua:
            return "Safari"
        if "Edg" in ua:
            return "Edge"
        if "MSIE" in ua or "Trident" in ua:
            return "IE"
        return "Other"

    def get_overview(self, db_path: str, site_id: str, days: int = 30) -> dict:
        """Return analytics overview (sessions, pageviews, bounce rate, etc.)."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT
                    COUNT(*) as pageviews,
                    COUNT(DISTINCT session_id) as sessions,
                    SUM(CASE WHEN is_bot=0 THEN 1 ELSE 0 END) as human_pageviews,
                    SUM(CASE WHEN is_bot=1 THEN 1 ELSE 0 END) as bot_pageviews,
                    COUNT(DISTINCT CASE WHEN is_bot=0 THEN page_url END) as unique_pages
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ?""",
                (site_id, since),
            )
            row = cur.fetchone()
            return dict(row) if row else {}
        except Exception:
            return {}
        finally:
            conn.close()

    def get_top_pages(self, db_path: str, site_id: str, days: int = 30) -> list[dict]:
        """Return top pages by pageview count."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT page_url, COUNT(*) as views
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ? AND is_bot=0
                   GROUP BY page_url ORDER BY views DESC LIMIT 50""",
                (site_id, since),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def get_traffic_sources(self, db_path: str, site_id: str, days: int = 30) -> list[dict]:
        """Return traffic breakdown by referrer/source."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT referrer, COUNT(*) as sessions
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ? AND is_bot=0
                   GROUP BY referrer ORDER BY sessions DESC LIMIT 50""",
                (site_id, since),
            )
            rows = [dict(r) for r in cur.fetchall()]
            processor = AnalyticsProcessor()
            for r in rows:
                info = processor.classify_referrer(r.get("referrer") or "")
                r.update(info)
            return rows
        except Exception:
            return []
        finally:
            conn.close()

    def get_device_breakdown(self, db_path: str, site_id: str, days: int = 30) -> list[dict]:
        """Return session breakdown by device type."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT device, COUNT(*) as count
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ? AND is_bot=0
                   GROUP BY device ORDER BY count DESC""",
                (site_id, since),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def get_ai_traffic(self, db_path: str, site_id: str, days: int = 30) -> dict:
        """Return AI assistant traffic breakdown (ChatGPT, Claude, Perplexity, etc.)."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT referrer, COUNT(*) as visits
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ?
                   GROUP BY referrer""",
                (site_id, since),
            )
            rows = [dict(r) for r in cur.fetchall()]
        except Exception:
            rows = []
        finally:
            conn.close()

        ai_traffic: dict[str, int] = defaultdict(int)
        total_ai = 0
        for r in rows:
            ref = r.get("referrer") or ""
            for ai_site in _AI_REFERRERS:
                if ai_site in ref.lower():
                    ai_traffic[ai_site] += r["visits"]
                    total_ai += r["visits"]
        return {"total": total_ai, "sources": dict(ai_traffic)}

    def get_bot_analytics(self, db_path: str, site_id: str, days: int = 30) -> dict:
        """Return bot traffic breakdown."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            cur = conn.execute(
                """SELECT bot_name, COUNT(*) as visits
                   FROM analytics_events
                   WHERE site_id=? AND timestamp >= ? AND is_bot=1
                   GROUP BY bot_name ORDER BY visits DESC""",
                (site_id, since),
            )
            bots = [dict(r) for r in cur.fetchall()]
            total_cur = conn.execute(
                """SELECT COUNT(*) as total, SUM(CASE WHEN is_bot=1 THEN 1 ELSE 0 END) as bot_count
                   FROM analytics_events WHERE site_id=? AND timestamp >= ?""",
                (site_id, since),
            )
            totals = dict(total_cur.fetchone() or {})
        except Exception:
            bots = []
            totals = {}
        finally:
            conn.close()

        return {"bots": bots, "totals": totals}

    def analyze_funnel(self, db_path: str, funnel_id: int) -> dict:
        """Analyze funnel conversion rates based on stored funnel steps."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            cur = conn.execute("SELECT * FROM analytics_funnels WHERE id=?", (funnel_id,))
            row = cur.fetchone()
            if not row:
                return {"error": "Funnel not found"}
            funnel = dict(row)
            steps = json.loads(funnel.get("steps") or "[]")
            if not steps:
                return {"error": "No steps defined"}

            results = []
            for i, step in enumerate(steps):
                url_pattern = step.get("url", "")
                cur = conn.execute(
                    """SELECT COUNT(DISTINCT session_id) as sessions
                       FROM analytics_events WHERE page_url LIKE ? AND is_bot=0""",
                    (f"%{url_pattern}%",),
                )
                count_row = cur.fetchone()
                results.append({
                    "step": i + 1,
                    "name": step.get("name", f"Step {i + 1}"),
                    "url": url_pattern,
                    "sessions": (count_row or {}).get("sessions", 0) if count_row else 0,
                })

            for i in range(1, len(results)):
                prev = results[i - 1]["sessions"]
                curr = results[i]["sessions"]
                results[i]["conversion_rate"] = round(curr / prev * 100, 2) if prev else 0.0
            if results:
                results[0]["conversion_rate"] = 100.0

            return {"funnel": funnel, "steps": results}
        except Exception as exc:
            return {"error": str(exc)}
        finally:
            conn.close()

    def generate_tracking_script(self, site_id: str, endpoint: str) -> str:
        """Generate the JavaScript tracking snippet for embedding on websites."""
        return _TRACKING_SCRIPT_TEMPLATE.format(site_id=site_id, endpoint=endpoint)


# ---------------------------------------------------------------------------
# Lightweight JavaScript tracking script template
# ---------------------------------------------------------------------------

_TRACKING_SCRIPT_TEMPLATE = """<!-- WebsiteProfiling Analytics - Privacy-first, cookie-free -->
<script>
(function(){{
  var sid='{site_id}',ep='{endpoint}';
  function uid(){{return Math.random().toString(36).slice(2)+Date.now().toString(36)}}
  var ssid=sessionStorage.getItem('_wp_sid');
  if(!ssid){{ssid=uid();sessionStorage.setItem('_wp_sid',ssid)}}
  function getUtm(p){{
    var q=new URLSearchParams(window.location.search);
    var map={{source:'utm_source',medium:'utm_medium',campaign:'utm_campaign',content:'utm_content',term:'utm_term'}};
    var r={{}};
    for(var k in map){{if(q.get(map[k]))r[k]=q.get(map[k])}}
    return r;
  }}
  function send(t,d){{
    var ua=navigator.userAgent;
    var payload=Object.assign({{
      site_id:sid,event_type:t,session_id:ssid,
      page_url:window.location.href,referrer:document.referrer,
      timestamp:new Date().toISOString(),
      device:/Mobi|Android/i.test(ua)?'mobile':/iPad|Tablet/i.test(ua)?'tablet':'desktop',
      browser:(ua.match(/(Chrome|Firefox|Safari|Edge|MSIE)/))||['Other'],
    }},getUtm(),d||{{}});
    if(navigator.sendBeacon){{navigator.sendBeacon(ep,JSON.stringify(payload))}}
    else{{fetch(ep,{{method:'POST',body:JSON.stringify(payload),keepalive:true}})}}
  }}
  send('pageview');
  document.addEventListener('click',function(e){{
    var el=e.target.closest('a[href]');
    if(el&&el.hostname!==location.hostname){{
      send('outbound_click',{{href:el.href,text:el.textContent.trim().slice(0,50)}})
    }}
  }});
  window._wpTrack=function(event,data){{send(event,data)}};
}})();
</script>"""


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def cmd_import_log(db_path: str, log_file: str, site_id: str) -> None:
    """Import Apache/Nginx access log into analytics_events table."""
    # Common Log Format: %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-agent}i"
    pattern = re.compile(
        r'(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] "(?P<request>[^"]*)" '
        r'(?P<status>\d+) \S+ "(?P<referrer>[^"]*)" "(?P<ua>[^"]*)"'
    )
    processor = AnalyticsProcessor()
    conn = get_connection(db_path)
    init_extended_schema(conn)
    count = 0
    skipped = 0

    try:
        with open(log_file, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = pattern.match(line.strip())
                if not m:
                    skipped += 1
                    continue
                d = m.groupdict()
                request_parts = d["request"].split()
                page_url = request_parts[1] if len(request_parts) >= 2 else "/"
                event = {
                    "site_id": site_id,
                    "timestamp": _parse_clf_time(d["time"]),
                    "page_url": page_url,
                    "referrer": d["referrer"] if d["referrer"] != "-" else "",
                    "user_agent": d["ua"],
                    "event_type": "pageview",
                }
                event = processor.process_event(event)
                write_analytics_event(conn, event)
                count += 1
                if count % 1000 == 0:
                    print(f"  Imported {count} events...", flush=True)
    except FileNotFoundError:
        print(f"Log file not found: {log_file}")
        conn.close()
        return

    conn.close()
    print(f"Imported {count} events ({skipped} skipped) for site '{site_id}'.")


def _parse_clf_time(clf_time: str) -> str:
    """Parse Common Log Format timestamp to ISO format."""
    try:
        dt = datetime.strptime(clf_time[:26], "%d/%b/%Y:%H:%M:%S %z")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def cmd_report(db_path: str, site_id: str, days: int = 30) -> None:
    """Print analytics report for a site."""
    processor = AnalyticsProcessor()
    print(f"\nAnalytics Report: {site_id}  (last {days} days)")
    print("=" * 60)

    overview = processor.get_overview(db_path, site_id, days)
    print(f"\nOverview:")
    print(f"  Pageviews (human)  : {overview.get('human_pageviews', 0):,}")
    print(f"  Sessions           : {overview.get('sessions', 0):,}")
    print(f"  Unique Pages       : {overview.get('unique_pages', 0):,}")
    print(f"  Bot Traffic        : {overview.get('bot_pageviews', 0):,}")

    print("\nTop Pages:")
    for p in processor.get_top_pages(db_path, site_id, days)[:10]:
        print(f"  {p.get('views', 0):>6}  {p.get('page_url', '')[:60]}")

    print("\nTraffic Sources:")
    for s in processor.get_traffic_sources(db_path, site_id, days)[:10]:
        src = s.get("source", s.get("referrer", "(direct)")) or "(direct)"
        print(f"  {s.get('sessions', 0):>6}  [{s.get('channel', '?'):10}] {src[:40]}")

    print("\nDevice Breakdown:")
    for d in processor.get_device_breakdown(db_path, site_id, days):
        print(f"  {d.get('device', '?'):<12} {d.get('count', 0):,}")

    ai = processor.get_ai_traffic(db_path, site_id, days)
    if ai.get("total", 0):
        print(f"\nAI Traffic: {ai['total']:,} visits")
        for src, cnt in sorted(ai.get("sources", {}).items(), key=lambda x: -x[1])[:5]:
            print(f"  {cnt:>6}  {src}")


def cmd_generate_script(site_id: str, endpoint: str) -> None:
    """Print the tracking script for embedding on a website."""
    processor = AnalyticsProcessor()
    print(processor.generate_tracking_script(site_id, endpoint))


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for analytics command."""
    parser = argparse.ArgumentParser(description="Web Analytics")
    parser.add_argument("subcommand", choices=["import-log", "report", "generate-script"])
    parser.add_argument("--db", default="report.db")
    parser.add_argument("--site-id", default="default", dest="site_id")
    parser.add_argument("--log", dest="log_file")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--endpoint", default="https://your-server.com/analytics/track")
    parsed = parser.parse_args(args)

    if parsed.subcommand == "import-log":
        if not parsed.log_file:
            print("Provide --log path to access log", file=__import__("sys").stderr)
            return 1
        cmd_import_log(parsed.db, parsed.log_file, parsed.site_id)
    elif parsed.subcommand == "report":
        cmd_report(parsed.db, parsed.site_id, parsed.days)
    elif parsed.subcommand == "generate-script":
        cmd_generate_script(parsed.site_id, parsed.endpoint)
    return 0
