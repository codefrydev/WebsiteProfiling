"""Social media management, publishing, and listening."""
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional


class SocialManager:
    """Manage social posts in the local DB (schedule, draft, publish)."""

    def schedule_post(self, db_path: str, project_id: int, content: str,
                      platforms: list, scheduled_at: str, media_urls: list = None) -> int:
        """Save a scheduled post to the DB. Returns post id."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        cur = conn.execute(
            """INSERT INTO social_posts
               (project_id, account_ids, content, media_urls, scheduled_at, status)
               VALUES (?, ?, ?, ?, ?, 'scheduled')""",
            (project_id, json.dumps(platforms), content, json.dumps(media_urls or []), scheduled_at),
        )
        post_id = cur.lastrowid
        conn.commit()
        conn.close()
        return post_id

    def publish_post(self, db_path: str, post_id: int) -> dict:
        """Publish a scheduled post immediately across configured platforms."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        cur = conn.execute("SELECT * FROM social_posts WHERE id=?", (post_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"error": f"Post {post_id} not found"}
        post = dict(row)
        platforms = json.loads(post.get("account_ids") or "[]")
        content = post.get("content", "")
        publisher = SocialPublisher()
        results = {}
        for platform in platforms:
            if platform == "twitter":
                results["twitter"] = publisher.publish_to_twitter(content)
            elif platform == "linkedin":
                results["linkedin"] = publisher.publish_to_linkedin(content)
            elif platform == "facebook":
                results["facebook"] = publisher.publish_to_facebook(content)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE social_posts SET status='published', published_at=?, metrics=? WHERE id=?",
            (now, json.dumps(results), post_id),
        )
        conn.commit()
        conn.close()
        return results

    def get_scheduled_posts(self, db_path: str, project_id: int = None) -> list:
        """Return all scheduled/draft posts."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM social_posts WHERE status IN ('scheduled','draft') AND project_id=? ORDER BY scheduled_at",
                (project_id,),
            )
        else:
            cur = conn.execute(
                "SELECT * FROM social_posts WHERE status IN ('scheduled','draft') ORDER BY scheduled_at"
            )
        posts = [dict(r) for r in cur.fetchall()]
        conn.close()
        return posts

    def fetch_analytics(self, db_path: str, post_id: int) -> dict:
        """Return stored metrics for a published post."""
        from src.db import get_connection
        conn = get_connection(db_path)
        cur = conn.execute("SELECT * FROM social_metrics WHERE post_id=? ORDER BY date DESC", (post_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"post_id": post_id, "metrics": rows}


class SocialPublisher:
    """Publish content to social platforms via their APIs."""

    def publish_to_twitter(self, content: str, media_ids: list = None) -> dict:
        """Post to Twitter/X using tweepy."""
        api_key = os.getenv("TWITTER_API_KEY", "")
        api_secret = os.getenv("TWITTER_API_SECRET", "")
        access_token = os.getenv("TWITTER_ACCESS_TOKEN", "")
        access_secret = os.getenv("TWITTER_ACCESS_SECRET", "")
        if not all([api_key, api_secret, access_token, access_secret]):
            return {"platform": "twitter", "status": "skipped", "reason": "API credentials not configured"}
        try:
            import tweepy
            client = tweepy.Client(
                consumer_key=api_key,
                consumer_secret=api_secret,
                access_token=access_token,
                access_token_secret=access_secret,
            )
            resp = client.create_tweet(text=content[:280])
            return {"platform": "twitter", "status": "published", "post_id": str(resp.data["id"])}
        except ImportError:
            return {"platform": "twitter", "status": "error", "reason": "tweepy not installed"}
        except Exception as e:
            return {"platform": "twitter", "status": "error", "reason": str(e)}

    def publish_to_linkedin(self, content: str, image_url: str = None) -> dict:
        """Post to LinkedIn using the LinkedIn API."""
        access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
        person_id = os.getenv("LINKEDIN_PERSON_ID", "")
        if not access_token:
            return {"platform": "linkedin", "status": "skipped", "reason": "LINKEDIN_ACCESS_TOKEN not configured"}
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            }
            payload = {
                "author": f"urn:li:person:{person_id}",
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": content},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }
            with httpx.Client(timeout=15) as client:
                resp = client.post("https://api.linkedin.com/v2/ugcPosts", headers=headers, json=payload)
            if resp.status_code in (200, 201):
                return {"platform": "linkedin", "status": "published", "post_id": resp.json().get("id", "")}
            return {"platform": "linkedin", "status": "error", "reason": resp.text}
        except Exception as e:
            return {"platform": "linkedin", "status": "error", "reason": str(e)}

    def publish_to_facebook(self, content: str, link: str = None) -> dict:
        """Post to Facebook Page using Graph API."""
        page_token = os.getenv("FACEBOOK_PAGE_TOKEN", "")
        page_id = os.getenv("FACEBOOK_PAGE_ID", "")
        if not page_token or not page_id:
            return {"platform": "facebook", "status": "skipped", "reason": "FACEBOOK_PAGE_TOKEN/ID not configured"}
        try:
            import httpx
            payload = {"message": content, "access_token": page_token}
            if link:
                payload["link"] = link
            with httpx.Client(timeout=15) as client:
                resp = client.post(f"https://graph.facebook.com/v18.0/{page_id}/feed", data=payload)
            if resp.status_code == 200:
                return {"platform": "facebook", "status": "published", "post_id": resp.json().get("id", "")}
            return {"platform": "facebook", "status": "error", "reason": resp.text}
        except Exception as e:
            return {"platform": "facebook", "status": "error", "reason": str(e)}


class SocialListening:
    """Monitor social mentions and find influencers."""

    def scan_mentions(self, brand: str, platforms: list = None) -> list:
        """Scan social platforms for brand mentions."""
        platforms = platforms or ["reddit", "hackernews"]
        mentions = []
        if "reddit" in platforms:
            mentions.extend(self._scan_reddit(brand))
        if "hackernews" in platforms:
            mentions.extend(self._scan_hackernews(brand))
        return mentions

    def _scan_reddit(self, brand: str) -> list:
        try:
            import requests
            headers = {"User-Agent": "WebsiteProfiling/1.0 social-listener"}
            resp = requests.get(
                f"https://www.reddit.com/search.json?q={brand}&sort=new&limit=20",
                headers=headers,
                timeout=10,
            )
            if resp.status_code != 200:
                return []
            posts = resp.json().get("data", {}).get("children", [])
            return [
                {
                    "platform": "reddit",
                    "url": f"https://reddit.com{p['data'].get('permalink', '')}",
                    "text": p["data"].get("title", ""),
                    "author": p["data"].get("author", ""),
                    "score": p["data"].get("score", 0),
                    "created_at": datetime.fromtimestamp(p["data"].get("created_utc", 0)).isoformat(),
                }
                for p in posts
            ]
        except Exception:
            return []

    def _scan_hackernews(self, brand: str) -> list:
        try:
            import requests
            resp = requests.get(
                f"https://hn.algolia.com/api/v1/search?query={brand}&tags=story",
                timeout=10,
            )
            if resp.status_code != 200:
                return []
            hits = resp.json().get("hits", [])[:10]
            return [
                {
                    "platform": "hackernews",
                    "url": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                    "text": h.get("title", ""),
                    "author": h.get("author", ""),
                    "score": h.get("points", 0),
                    "created_at": h.get("created_at", ""),
                }
                for h in hits
            ]
        except Exception:
            return []

    def find_influencers(self, topic: str, platform: str = "reddit") -> list:
        """Find top contributors/influencers for a topic."""
        if platform != "reddit":
            return []
        try:
            import requests
            headers = {"User-Agent": "WebsiteProfiling/1.0 social-listener"}
            resp = requests.get(
                f"https://www.reddit.com/search.json?q={topic}&sort=top&limit=25",
                headers=headers,
                timeout=10,
            )
            if resp.status_code != 200:
                return []
            posts = resp.json().get("data", {}).get("children", [])
            author_scores = {}
            for p in posts:
                author = p["data"].get("author", "[deleted]")
                score = p["data"].get("score", 0)
                author_scores[author] = author_scores.get(author, 0) + score
            return sorted(
                [{"author": a, "total_score": s, "platform": platform} for a, s in author_scores.items()],
                key=lambda x: x["total_score"],
                reverse=True,
            )[:10]
        except Exception:
            return []


def cmd_schedule(db_path: str, project_id: int, content: str, platforms: list, scheduled_at: str):
    manager = SocialManager()
    post_id = manager.schedule_post(db_path, project_id, content, platforms, scheduled_at)
    print(f"Post scheduled (id={post_id}) for {scheduled_at} on: {', '.join(platforms)}")


def cmd_publish(db_path: str, post_id: int):
    manager = SocialManager()
    results = manager.publish_post(db_path, post_id)
    for platform, result in results.items():
        status = result.get("status", "?")
        print(f"  {platform}: {status} - {result.get('post_id', result.get('reason', ''))}")


def cmd_list(db_path: str, project_id: int = None):
    manager = SocialManager()
    posts = manager.get_scheduled_posts(db_path, project_id)
    print(f"Scheduled/draft posts: {len(posts)}")
    for p in posts:
        platforms = ", ".join(json.loads(p.get("account_ids") or "[]"))
        print(f"  id={p['id']}  [{p['status']}]  {p.get('scheduled_at', '')}  [{platforms}]  {p.get('content', '')[:60]}")


def cmd_mentions(db_path: str, brand: str):
    listener = SocialListening()
    print(f"Scanning for mentions of '{brand}'...")
    mentions = listener.scan_mentions(brand)
    print(f"Found {len(mentions)} mentions:")
    for m in mentions[:10]:
        print(f"  [{m['platform']}] {m['text'][:80]}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Social Media Management")
    sub = parser.add_subparsers(dest="cmd")

    sched_p = sub.add_parser("schedule", help="Schedule a post")
    sched_p.add_argument("--project-id", type=int, default=1)
    sched_p.add_argument("--content", required=True)
    sched_p.add_argument("--platforms", default="twitter,linkedin")
    sched_p.add_argument("--at", dest="scheduled_at", required=True, help="ISO datetime e.g. 2026-04-01T09:00:00")

    pub_p = sub.add_parser("publish", help="Publish a scheduled post now")
    pub_p.add_argument("--post-id", type=int, required=True)

    sub.add_parser("list", help="List scheduled posts").add_argument("--project-id", type=int, default=None)

    ment_p = sub.add_parser("mentions", help="Scan for brand mentions")
    ment_p.add_argument("--brand", required=True)

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "schedule":
        platforms = [p.strip() for p in parsed.platforms.split(",")]
        cmd_schedule(db, parsed.project_id, parsed.content, platforms, parsed.scheduled_at)
    elif parsed.cmd == "publish":
        cmd_publish(db, parsed.post_id)
    elif parsed.cmd == "list":
        cmd_list(db, parsed.project_id)
    elif parsed.cmd == "mentions":
        cmd_mentions(db, parsed.brand)
    else:
        parser.print_help()
