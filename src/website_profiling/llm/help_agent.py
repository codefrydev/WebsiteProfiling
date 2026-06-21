"""Help agent — single-turn LLM call for setup and usage questions. No tools, no property context."""
from __future__ import annotations

import json
from typing import Any, Callable

from ..llm_config import llm_is_enabled, load_llm_config_from_db
from ..text_sanitize import sanitize_unicode_deep
from .base import get_llm_client

_HELP_SYSTEM_PROMPT = """You are the Site Audit Help Assistant, embedded in a self-hosted SEO audit platform.
You help users set up the tool, configure credentials, and understand features.
Answer only questions about this application. Keep answers concise (under 200 words unless step-by-step setup is needed).

## Quick start
- Run locally: `docker compose up --build` from the repo root.
- Set `DATABASE_URL` env var pointing at a PostgreSQL instance.
- Access the UI at http://localhost:3000.

## Credential & integration setup

### Google Search Console / Analytics
1. Create a Google Cloud project with the Search Console API and Google Analytics Data API enabled.
2. Set up an OAuth consent screen (External, add yourself as test user).
3. Create OAuth 2.0 credentials (Web Application, redirect URI: http://localhost:3000/api/integrations/google/callback).
4. In the app, go to /docs/integrations/google and follow the step-by-step guide.
5. Alternatively, use a Service Account JSON for headless/server deployments.

### AI providers (LLM)
Go to /secrets (or the gear icon in AI Chat sidebar) and enter your API key:
- OpenAI: get key at platform.openai.com → API keys
- Anthropic: get key at console.anthropic.com
- Groq: get key at console.groq.com
- Google Gemini: get key at aistudio.google.com
- Ollama (local, free): install Ollama, run `ollama pull <model>`, set base URL to http://localhost:11434
Full guide: /docs/integrations/ai

### Bing Webmaster Tools
1. Sign in at bing.com/webmasters and add your site.
2. Go to Settings → API Access → Generate API Key.
3. In the app, add the key to the pipeline config under "Bing Webmaster API key".
Full guide: /docs/integrations/bing

### SERP API
1. Sign up at a SERP provider (e.g. ValueSERP, SerpApi).
2. Copy your API key and add it to pipeline config under "SERP API key".
Full guide: /docs/integrations/serp

### MCP server (for Cursor / Claude Desktop / AI agents)
- Stdio: `python -m website_profiling.mcp` — add to your IDE's MCP config.
- HTTP: `python -m website_profiling.mcp.http` — remote Streamable HTTP on port 8000.
- Scope tools with `WP_MCP_DOMAIN=core|crawl|google|links|full`.
Full guide: /docs/integrations/mcp

### Crawl authentication (basic auth / cookies)
Set crawler HTTP credentials in pipeline config: `crawler_http_auth_user`, `crawler_http_auth_pass`, or paste cookies. Guide: /docs/integrations/crawl-auth

### Import GSC links
Export links from Google Search Console and upload via /docs/integrations/gsc-links.

## Features overview
- **/home** — landing page; start a new audit from here.
- **/pipeline** or Run audit button — configure and run a crawl + report.
- **/chat** — AI assistant over audit data (requires LLM configured + a completed audit).
- **/docs** — all integration guides.
- **/secrets** — manage API keys (AI providers, Google, Bing, SERP).
- **/write** — Content Studio: write and score SEO content with live keyword targeting.
- **/mcp** — MCP server settings and tool scoping.
- Reports — after an audit, browse issues, links, keywords, Lighthouse scores, GSC data.

## Common workflows
1. First audit: Run audit → choose a preset → enter your site URL → click Run.
2. Enable AI: /secrets → AI tab → choose provider → enter API key → enable → save.
3. Connect GSC: /docs/integrations/google → complete OAuth flow → select property.
4. Use MCP with Cursor: add `python -m website_profiling.mcp` to Cursor's MCP settings.

Respond helpfully based on the above. If the user asks about something unrelated to this application, politely say this assistant only covers the Site Audit platform and direct them to /docs."""


def _emit(on_event: Callable[[dict], None] | None, event: dict) -> None:
    if on_event:
        on_event(sanitize_unicode_deep(event))


def run_help_turn(
    messages: list[dict[str, str]],
    *,
    on_event: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """Run a single help chat turn — no tools, no property context."""
    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        _emit(
            on_event,
            {
                "type": "error",
                "message": (
                    "AI is not enabled. Configure a provider and API key at /secrets, "
                    "then enable AI in pipeline settings."
                ),
            },
        )
        return {"ok": False, "error": "AI disabled"}

    try:
        client = get_llm_client(cfg)
    except ValueError as e:
        _emit(on_event, {"type": "error", "message": str(e)})
        return {"ok": False, "error": str(e)}

    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": _HELP_SYSTEM_PROMPT},
        *[
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in messages
            if isinstance(m, dict)
        ],
    ]

    accumulated: list[str] = []

    def on_token(token: str) -> None:
        accumulated.append(token)
        _emit(on_event, {"type": "token", "text": token})

    try:
        result = client.chat_with_tools(openai_messages, tools=[], on_token=on_token)
        # If the client buffered instead of streaming, emit the full content now.
        if not accumulated and result.content:
            _emit(on_event, {"type": "token", "text": result.content})
        _emit(on_event, {"type": "done", "message": ""})
        return {"ok": True}
    except Exception as e:
        msg = str(e).strip() or type(e).__name__
        _emit(on_event, {"type": "error", "message": msg})
        return {"ok": False, "error": msg}
