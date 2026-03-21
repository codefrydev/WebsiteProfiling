import json
from typing import Any, Optional

from app.core.config import settings


def _truncate(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


class AIService:
    def _get_openai_client(self):
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    def _get_anthropic_client(self):
        import anthropic
        return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def generate_content_brief(self, keyword: str, intent: str, competitor_data: list = None) -> dict:
        if not settings.OPENAI_API_KEY:
            return {"keyword": keyword, "intent": intent, "keywords": [], "outline": [], "word_count": 1000}

        client = self._get_openai_client()
        prompt = (
            f"Create an SEO content brief for the keyword: '{keyword}'\n"
            f"Search intent: {intent}\n"
            f"Return JSON with keys: title, keywords (list), outline (list of sections), "
            f"word_count, meta_description, target_audience"
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    def _fallback_ppc_ads(self, product: str, audience: str) -> list[dict[str, Any]]:
        p = _truncate(product or "your offer", 50)
        a = _truncate(audience or "customers", 36)
        return [
            {
                "headline": _truncate(f"{p.split()[0] if p.split() else p} for {a}", 30),
                "title": _truncate(f"{p.split()[0] if p.split() else p} for {a}", 30),
                "description": _truncate(f"Trusted {p} tailored for {a}. Fast checkout and human support.", 90),
                "display_url": "yoursite.com",
                "cta": "Shop now",
            },
            {
                "headline": _truncate(f"Save on {p}", 30),
                "title": _truncate(f"Save on {p}", 30),
                "description": _truncate(f"Exclusive value for {a}. See ratings, compare plans, start in minutes.", 90),
                "display_url": "yoursite.com/deals",
                "cta": "Get offer",
            },
            {
                "headline": _truncate(f"Top-rated {p}", 30),
                "title": _truncate(f"Top-rated {p}", 30),
                "description": _truncate(f"Quality {p} built for {a}. Simple onboarding, clear pricing.", 90),
                "display_url": "yoursite.com",
                "cta": "Learn more",
            },
            {
                "headline": _truncate(f"Try {p} free", 30),
                "title": _truncate(f"Try {p} free", 30),
                "description": _truncate(f"Risk-free trial for {a}. Cancel anytime. No long contracts.", 90),
                "display_url": "yoursite.com/trial",
                "cta": "Start free",
            },
        ]

    async def generate_ppc_ad_variations(self, product: str, audience: str) -> list[dict[str, Any]]:
        """Return 3–4 ad objects: headline, description, display_url, cta (and title mirror)."""
        product = (product or "").strip()
        audience = (audience or "customers").strip()
        if not product:
            return []

        if not settings.OPENAI_API_KEY:
            return self._fallback_ppc_ads(product, audience)

        client = self._get_openai_client()
        prompt = (
            f"Product/service: {product}\n"
            f"Target audience: {audience}\n\n"
            'Return JSON: {"ads": ['
            '{"headline": "max 30 chars", "description": "max 90 chars", '
            '"display_url": "short domain path like example.com/sale", "cta": "2-4 words"}'
            "]}\n"
            "Provide 4 distinct angles (benefit, social proof, offer, urgency). No placeholder text."
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        raw = json.loads(response.choices[0].message.content)
        ads = raw.get("ads") if isinstance(raw, dict) else None
        if not isinstance(ads, list):
            return self._fallback_ppc_ads(product, audience)
        out: list[dict[str, Any]] = []
        for item in ads[:6]:
            if not isinstance(item, dict):
                continue
            h = _truncate(str(item.get("headline") or item.get("title") or ""), 30)
            d = _truncate(str(item.get("description") or ""), 90)
            if not h or not d:
                continue
            du = str(item.get("display_url") or "yoursite.com").strip() or "yoursite.com"
            cta = str(item.get("cta") or "Learn more").strip() or "Learn more"
            out.append(
                {
                    "headline": h,
                    "title": h,
                    "description": d,
                    "display_url": du[:80],
                    "cta": cta[:40],
                }
            )
        return out if out else self._fallback_ppc_ads(product, audience)

    async def generate_article_draft(self, brief: dict, word_count: int = 1000) -> str:
        if not settings.OPENAI_API_KEY:
            title = brief.get("title") or brief.get("keyword") or "Article"
            outline = brief.get("outline") or []
            if isinstance(outline, str):
                outline = [outline]
            parts = [
                f"<h2>{title}</h2>",
                "<p><em>Draft scaffold (no OPENAI_API_KEY). Add your API key in backend env for a full generated article.</em></p>",
            ]
            for i, sec in enumerate(outline[:14]):
                if isinstance(sec, dict):
                    h = sec.get("title") or sec.get("heading") or f"Section {i + 1}"
                else:
                    h = str(sec) or f"Section {i + 1}"
                parts.append(f"<h3>{h}</h3>")
                parts.append(
                    "<p>Explain this point with one stat or example, a sub-heading if needed, "
                    "and a sentence that matches the reader's search intent.</p>"
                )
            if not outline:
                parts += [
                    "<h3>Introduction</h3><p>State the problem, who this is for, and the outcome they get.</p>",
                    "<h3>Key takeaways</h3><p>Three to five bullets backed by brief reasoning.</p>",
                    "<h3>How it works</h3><p>Step-by-step or a simple framework.</p>",
                    "<h3>FAQ</h3><p>Address two common objections or questions.</p>",
                    "<h3>Conclusion</h3><p>Recap and one clear call to action.</p>",
                ]
            return "\n".join(parts)

        client = self._get_openai_client()
        prompt = (
            f"Write a {word_count}-word SEO article based on this brief:\n"
            f"{brief}\n\n"
            "Use proper HTML headings (h2, h3), include the target keyword naturally, "
            "and optimize for the specified intent."
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
        )
        return response.choices[0].message.content

    async def generate_meta_tags(self, url: str, content: str, keyword: str) -> dict:
        if not settings.OPENAI_API_KEY:
            return {"title": f"{keyword} | Site", "description": f"Learn about {keyword}", "og_title": keyword}

        client = self._get_openai_client()
        prompt = (
            f"Generate SEO meta tags for this page:\n"
            f"URL: {url}\nTarget keyword: {keyword}\n"
            f"Content preview: {content[:500]}\n\n"
            "Return JSON with: title (max 60 chars), description (max 160 chars), "
            "og_title, og_description"
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    async def grade_content(self, content: str, keyword: str, competitors: list = None) -> dict:
        if not settings.OPENAI_API_KEY:
            return {"score": 50, "details": {}, "recommendations": ["Add more keyword usage", "Improve structure"]}

        client = self._get_openai_client()
        prompt = (
            f"Grade this content for the keyword '{keyword}' on a scale of 0-100.\n"
            f"Content: {content[:2000]}\n\n"
            "Return JSON with: score (0-100), details (object with sub-scores), "
            "recommendations (list of improvements)"
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    async def chat_seo_advisor(self, messages: list, context: dict = None) -> str:
        system = "You are an expert SEO advisor helping with technical SEO, content strategy, and marketing intelligence."
        if context:
            system += f"\nContext: {context}"

        if settings.OPENAI_API_KEY:
            client = self._get_openai_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": system}] + messages,
            )
            return response.choices[0].message.content

        if settings.ANTHROPIC_API_KEY:
            client = self._get_anthropic_client()
            api_messages = [
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in ("user", "assistant") and m.get("content")
            ]
            if not api_messages:
                return "Send a message to chat with the SEO advisor."
            response = await client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=2048,
                system=system,
                messages=api_messages,
            )
            block = response.content[0]
            return getattr(block, "text", str(block))

        return "Configure OPENAI_API_KEY or ANTHROPIC_API_KEY on the backend for live AI answers."

    async def suggest_review_response(self, review_text: str, rating: int, business_name: str) -> str:
        if not settings.OPENAI_API_KEY:
            return f"Thank you for your {rating}-star review! We appreciate your feedback."

        client = self._get_openai_client()
        sentiment = "positive" if rating >= 4 else "negative" if rating <= 2 else "neutral"
        prompt = (
            f"Write a professional response to this {sentiment} review for '{business_name}':\n"
            f"Rating: {rating}/5\nReview: {review_text}\n\n"
            "Keep it concise, professional, and empathetic. Max 150 words."
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        return response.choices[0].message.content

    async def scan_llm_for_brand(self, platform: str, brand: str, prompts: list) -> list[dict]:
        if not settings.OPENAI_API_KEY:
            return []

        client = self._get_openai_client()
        results = []
        for prompt_text in prompts:
            try:
                response = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt_text}],
                    max_tokens=500,
                )
                response_text = response.choices[0].message.content
                brand_mentioned = brand.lower() in response_text.lower()
                results.append({
                    "platform": platform,
                    "prompt": prompt_text,
                    "brand_mentioned": brand_mentioned,
                    "response_text": response_text,
                    "url_cited": None,
                    "position": None,
                    "sentiment": "positive" if brand_mentioned else "neutral",
                })
            except Exception:
                results.append({
                    "platform": platform,
                    "prompt": prompt_text,
                    "brand_mentioned": False,
                    "response_text": "",
                    "url_cited": None,
                    "position": None,
                    "sentiment": "neutral",
                })
        return results
