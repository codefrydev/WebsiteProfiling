"""AI SEO tools: conversational assistant, technical SEO automation, content optimization."""
import json
import os
from typing import Optional


class AISEOAssistant:
    """Chat with an AI that has context about your site's SEO data."""

    def __init__(self, db_path: str = None, api_key: str = None):
        self.db_path = db_path or os.getenv("DB_PATH", "report.db")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self._conversation = []

    def _build_context(self) -> str:
        """Pull key SEO data from DB to inject as context."""
        if not self.db_path or not os.path.exists(self.db_path):
            return "No SEO data available yet. Run a crawl first."
        try:
            from src.db import get_connection, read_crawl, read_tracked_keywords, read_rank_history
            conn = get_connection(self.db_path)
            df = read_crawl(conn)
            keywords = read_tracked_keywords(conn)
            history = read_rank_history(conn, days=7)
            conn.close()

            total_pages = len(df) if not df.empty else 0
            broken_links = len(df[df["status"].astype(str).str.startswith("4")]) if not df.empty and "status" in df.columns else 0
            missing_meta = len(df[df.get("meta_description", df.get("description", "")).astype(str).str.strip() == ""]) if not df.empty else 0
            top_10 = sum(1 for h in history if h.get("position", 99) <= 10)

            return (
                f"SEO Context:\n"
                f"- Total pages crawled: {total_pages}\n"
                f"- Broken links (4xx): {broken_links}\n"
                f"- Pages missing meta description: {missing_meta}\n"
                f"- Tracked keywords: {len(keywords)}\n"
                f"- Keywords in top 10: {top_10}\n"
            )
        except Exception as e:
            return f"Context unavailable: {e}"

    def chat(self, message: str, include_context: bool = True) -> str:
        """Send a message and get an AI response with SEO context."""
        if not self.api_key:
            return "OPENAI_API_KEY not configured. Set it in .env"
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self.api_key)
            if not self._conversation:
                system_content = (
                    "You are an expert SEO consultant helping analyze and improve website search engine optimization. "
                    "You have access to the user's site data and provide actionable, specific recommendations. "
                    "Be concise, practical, and prioritize high-impact improvements."
                )
                if include_context:
                    system_content += f"\n\n{self._build_context()}"
                self._conversation.append({"role": "system", "content": system_content})

            self._conversation.append({"role": "user", "content": message})
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=self._conversation,
                max_tokens=1000,
            )
            reply = resp.choices[0].message.content
            self._conversation.append({"role": "assistant", "content": reply})
            return reply
        except Exception as e:
            return f"Error: {e}"

    def suggest_fixes(self, issues: list) -> str:
        """Ask AI to prioritize and explain SEO issue fixes."""
        if not issues:
            return "No issues provided."
        issues_text = "\n".join(f"- {issue}" for issue in issues[:20])
        prompt = (
            f"Analyze these SEO issues and provide prioritized fixes with estimated impact:\n\n"
            f"{issues_text}\n\n"
            "Format as: Priority (High/Medium/Low) | Issue | Fix | Expected Impact"
        )
        return self.chat(prompt, include_context=True)

    def analyze_url(self, url: str) -> str:
        """Request AI analysis of a specific URL's SEO."""
        try:
            import requests
            from bs4 import BeautifulSoup
            resp = requests.get(url, timeout=10, headers={"User-Agent": "WebsiteProfiling/1.0"})
            soup = BeautifulSoup(resp.text, "html.parser")
            title = soup.title.string if soup.title else "No title"
            meta_desc = soup.find("meta", attrs={"name": "description"})
            meta_desc = meta_desc["content"] if meta_desc else "No meta description"
            h1s = [h.get_text(strip=True) for h in soup.find_all("h1")]
            word_count = len(soup.get_text().split())
            schema = bool(soup.find("script", attrs={"type": "application/ld+json"}))
            canonical = soup.find("link", rel="canonical")
            canonical = canonical["href"] if canonical else "None"

            page_info = (
                f"URL: {url}\n"
                f"Title: {title}\n"
                f"Meta Description: {meta_desc[:150]}\n"
                f"H1 Tags: {', '.join(h1s[:3]) or 'None'}\n"
                f"Word Count: {word_count}\n"
                f"Has Schema Markup: {schema}\n"
                f"Canonical: {canonical}"
            )
            prompt = f"Analyze this page's SEO and provide specific recommendations:\n\n{page_info}"
            return self.chat(prompt)
        except Exception as e:
            return f"Could not analyze URL: {e}"

    def reset(self):
        """Clear conversation history."""
        self._conversation = []


class AITechnicalSEO:
    """AI-powered technical SEO automation tools."""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")

    def _call_openai(self, prompt: str, json_response: bool = False) -> str:
        if not self.api_key:
            return '{"error": "OPENAI_API_KEY not configured"}' if json_response else "OPENAI_API_KEY not configured"
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self.api_key)
            kwargs = {
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
            }
            if json_response:
                kwargs["response_format"] = {"type": "json_object"}
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except Exception as e:
            return f'{{"error": "{e}"}}' if json_response else str(e)

    def generate_robots_txt(self, domain: str, cms: str = "custom", block_ai_bots: bool = True) -> str:
        """Generate an optimized robots.txt for the domain."""
        prompt = (
            f"Generate an optimized robots.txt for {domain} using {cms} CMS.\n"
            f"{'Include rules to block AI training bots (CCBot, GPTBot, Google-Extended, etc.).' if block_ai_bots else ''}\n"
            "Include appropriate crawl-delay, block admin/login areas, allow important crawlers.\n"
            "Return only the robots.txt content, no explanation."
        )
        return self._call_openai(prompt)

    def generate_schema_markup(self, page_type: str, data: dict) -> str:
        """Generate JSON-LD schema markup for a page."""
        data_str = json.dumps(data, indent=2)
        prompt = (
            f"Generate valid JSON-LD schema.org markup for a {page_type} page.\n"
            f"Page data:\n{data_str}\n\n"
            "Return only the complete JSON-LD script tag, no explanation."
        )
        return self._call_openai(prompt)

    def suggest_redirects(self, old_urls: list, new_url_structure: str) -> list:
        """Suggest 301 redirect mappings for URL migration."""
        urls_text = "\n".join(old_urls[:50])
        prompt = (
            f"Suggest 301 redirect mappings for a site migrating to this URL structure: {new_url_structure}\n\n"
            f"Old URLs:\n{urls_text}\n\n"
            "Return JSON array of objects with 'from' and 'to' keys."
        )
        result = self._call_openai(prompt, json_response=True)
        try:
            data = json.loads(result)
            return data if isinstance(data, list) else data.get("redirects", [data])
        except Exception:
            return [{"error": result}]

    def generate_meta_tags(self, urls_and_content: list) -> list:
        """Generate optimized title and meta description for multiple pages."""
        results = []
        for item in urls_and_content[:20]:
            url = item.get("url", "")
            content = item.get("content", item.get("title", ""))[:500]
            keyword = item.get("keyword", "")
            prompt = (
                f"Generate an SEO-optimized title tag and meta description for:\n"
                f"URL: {url}\n"
                f"Target Keyword: {keyword}\n"
                f"Content: {content}\n\n"
                "Return JSON with 'title' (max 60 chars) and 'meta_description' (max 160 chars)."
            )
            raw = self._call_openai(prompt, json_response=True)
            try:
                data = json.loads(raw)
                data["url"] = url
                results.append(data)
            except Exception:
                results.append({"url": url, "error": raw})
        return results

    def analyze_content_gap(self, topic: str, competitor_content: str, your_content: str) -> str:
        """Identify content gaps between your content and a competitor's."""
        prompt = (
            f"Analyze content gaps for the topic: '{topic}'\n\n"
            f"Competitor content summary:\n{competitor_content[:1000]}\n\n"
            f"Your content summary:\n{your_content[:1000]}\n\n"
            "Identify:\n1. Topics competitor covers that you don't\n"
            "2. Keywords competitor targets that you should\n"
            "3. Content improvements needed\n"
            "Be specific and actionable."
        )
        return self._call_openai(prompt)

    def generate_faq_schema(self, topic: str, count: int = 5) -> str:
        """Generate FAQ schema markup with questions/answers for a topic."""
        prompt = (
            f"Generate {count} FAQ question-answer pairs about '{topic}' for SEO purposes.\n"
            "Format as valid JSON-LD FAQPage schema markup.\n"
            "Questions should target common search queries. Return only the script tag."
        )
        return self._call_openai(prompt)

    def audit_title_tags(self, pages: list) -> list:
        """Audit and improve title tags in bulk."""
        results = []
        for page in pages[:30]:
            title = page.get("title", "")
            url = page.get("url", "")
            keyword = page.get("keyword", "")
            issues = []
            if not title:
                issues.append("Missing title tag")
            elif len(title) < 30:
                issues.append(f"Title too short ({len(title)} chars, min 30)")
            elif len(title) > 60:
                issues.append(f"Title too long ({len(title)} chars, max 60)")
            if keyword and title and keyword.lower() not in title.lower():
                issues.append(f"Target keyword '{keyword}' missing from title")
            results.append({"url": url, "title": title, "issues": issues, "ok": len(issues) == 0})
        return results


def cmd_chat(db_path: str):
    """Interactive chat mode with SEO assistant."""
    assistant = AISEOAssistant(db_path=db_path)
    print("SEO AI Assistant (type 'quit' to exit, 'reset' to clear history)")
    print("Initialized with your site's SEO context.\n")
    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit", "q"):
                break
            if user_input.lower() == "reset":
                assistant.reset()
                print("Conversation history cleared.\n")
                continue
            response = assistant.chat(user_input)
            print(f"\nAssistant: {response}\n")
        except KeyboardInterrupt:
            break
    print("Goodbye!")


def cmd_analyze_url(url: str, db_path: str = None):
    assistant = AISEOAssistant(db_path=db_path)
    print(f"Analyzing {url}...")
    result = assistant.analyze_url(url)
    print(f"\n{result}")


def cmd_robots_txt(domain: str, cms: str = "custom", no_block_ai: bool = False):
    ai = AITechnicalSEO()
    print(f"Generating robots.txt for {domain}...")
    result = ai.generate_robots_txt(domain, cms, block_ai_bots=not no_block_ai)
    print(result)


def cmd_schema(page_type: str, data_json: str):
    ai = AITechnicalSEO()
    try:
        data = json.loads(data_json)
    except Exception:
        print(f"Invalid JSON data: {data_json}")
        return
    print(f"Generating {page_type} schema markup...")
    result = ai.generate_schema_markup(page_type, data)
    print(result)


def cmd_meta_tags(db_path: str, project_id: int = 1):
    from src.db import get_connection, read_crawl, read_tracked_keywords
    conn = get_connection(db_path)
    df = read_crawl(conn)
    keywords = read_tracked_keywords(conn, project_id)
    conn.close()

    ai = AITechnicalSEO()
    pages = []
    if not df.empty:
        for _, row in df.head(10).iterrows():
            pages.append({"url": row.get("url", ""), "title": row.get("title", ""), "content": row.get("title", "")})

    if not pages:
        print("No crawl data available. Run a crawl first.")
        return

    print(f"Generating meta tags for {len(pages)} pages...")
    results = ai.generate_meta_tags(pages)
    for r in results:
        if "error" not in r:
            print(f"\n{r.get('url', '')}")
            print(f"  Title: {r.get('title', '')}")
            print(f"  Meta : {r.get('meta_description', '')}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="AI SEO Tools")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("chat", help="Interactive SEO AI chat")

    analyze_p = sub.add_parser("analyze", help="AI-analyze a URL's SEO")
    analyze_p.add_argument("url")

    robots_p = sub.add_parser("robots-txt", help="Generate optimized robots.txt")
    robots_p.add_argument("--domain", required=True)
    robots_p.add_argument("--cms", default="custom")
    robots_p.add_argument("--no-block-ai", action="store_true")

    schema_p = sub.add_parser("schema", help="Generate JSON-LD schema markup")
    schema_p.add_argument("--type", required=True, dest="page_type")
    schema_p.add_argument("--data", required=True, help='JSON data e.g. {"name":"Acme","price":"9.99"}')

    meta_p = sub.add_parser("meta-tags", help="Generate meta tags for crawled pages")
    meta_p.add_argument("--project-id", type=int, default=1)

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "chat":
        cmd_chat(db)
    elif parsed.cmd == "analyze":
        cmd_analyze_url(parsed.url, db)
    elif parsed.cmd == "robots-txt":
        cmd_robots_txt(parsed.domain, parsed.cms, parsed.no_block_ai)
    elif parsed.cmd == "schema":
        cmd_schema(parsed.page_type, parsed.data)
    elif parsed.cmd == "meta-tags":
        cmd_meta_tags(db, parsed.project_id)
    else:
        parser.print_help()
