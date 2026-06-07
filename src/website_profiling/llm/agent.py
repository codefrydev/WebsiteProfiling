"""Agent loop for in-app chat and MCP — tool calling with streaming events."""
from __future__ import annotations

import json
from typing import Any, Callable

from ..llm_config import llm_is_enabled, load_llm_config_from_db
from ..text_sanitize import sanitize_unicode_deep, strip_surrogates
from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.registry import TOOL_DEFINITIONS, dispatch_tool, openai_tools_schema
from .base import ChatResult, ToolCall, get_llm_client

MAX_TOOL_ROUNDS = 10

SYSTEM_PROMPT = """You are Site Audit AI, a technical SEO assistant for a self-hosted site audit platform.
You help users understand crawl results, audit issues, Lighthouse scores, keywords, and Search Console data.

Tool domains (prefer specific tools over generic list_issues):
- Portfolio/report: get_report_summary, get_category_scores, list_audit_categories, get_executive_summary, get_audit_recommendations, list_report_history
- Issues: list_issues, get_critical_issues, list_issues_by_category, get_category_issues, list_issues_with_ai_fixes, list_issue_workflow
- On-page: list_pages_missing_title, list_pages_noindex, list_seo_onpage_issues, list_content_url_issues
- Crawl/pages: search_pages, search_pages_advanced, get_page_details, get_page_analysis, list_status_4xx_pages, get_status_code_breakdown, get_depth_distribution
- Schema/technical: get_schema_coverage, get_seo_health, get_security_findings, get_tech_stack_summary
- Indexation: get_indexation_coverage, list_indexation_gaps, get_indexation_url_join
- Keywords: get_keyword_summary, get_striking_distance_keywords, list_keywords_by_position, get_keyword_serp_overlay
- Google: get_google_summary, get_gsc_top_queries, get_gsc_top_pages, get_google_integration_status, get_gsc_page_query_slice, get_ga4_page_metrics
- Links/backlinks: get_gsc_sample_links, get_backlinks_velocity, get_third_party_links_overlay
- Performance: get_lighthouse_summary, list_slow_pages, get_crux_summary, get_lighthouse_human_summary
- Content/charts: get_issue_priority_breakdown, get_mime_type_breakdown, get_title_length_distribution, get_domain_link_distribution, get_outlink_distribution, get_content_analytics, get_top_crawled_pages
- Ops/logs: get_property_ops, list_crawl_runs, get_latest_log_analysis
- Drift: compare_reports, compare_category_deltas, compare_issue_deltas, compare_url_set_diff, get_health_history, get_category_health_history

Visualization playbook (chat UI renders charts and tables from tool JSON automatically):
- Category scores / health: get_category_scores, list_audit_categories, or get_report_summary
- Issue breakdown: get_report_summary, get_issue_priority_breakdown (priority chart), and list_issues or get_critical_issues for the table
- Top critical issues (required trio): get_report_summary, get_issue_priority_breakdown, get_critical_issues — then only write recommendations, never enumerate issues in prose
- Audit overview / site health recap: get_report_summary (health, crawl, categories, issue counts). Keep prose to interpretation and next steps only — never repeat health score, URL counts, success rate, category scores, or priority counts in markdown; the UI renders those as cards and charts.
- Distributions: get_mime_type_breakdown, get_title_length_distribution, get_domain_link_distribution, get_status_code_breakdown, get_depth_distribution
- Trends over time: get_health_history, get_category_health_history
- Compare drift: compare_category_deltas, compare_issue_deltas
- Lighthouse: get_lighthouse_summary
- Google/GSC: get_google_summary, get_gsc_top_queries

Rules:
- Use the provided tools to query real audit data. Do not invent URLs, scores, or metrics.
- When citing issues, include the URL when available.
- The chat UI automatically renders charts, gauges, and tables from tool results. Never tell the user you cannot show graphs or charts, and never send them to other app pages for data you can fetch with tools.
- For visual or chart requests, always call the appropriate tools first, then give a short interpretation (2–4 sentences) with recommendations.
- When tools return issue lists, scores, or breakdowns, keep the narrative short. Do not re-list every issue or duplicate data in markdown tables—the UI renders structured blocks from tool data.
- Use markdown headings and bullets for structure. Do not emit fake chart JSON or custom visualization blocks.
- You are read-only: you cannot run crawls or change settings.
- If data is missing, say what integration or crawl step is needed.
"""

REACT_PROMPT_SUFFIX = """
Respond with valid JSON only, one of:
{"action":"tool","name":"<tool_name>","args":{...}}
{"action":"answer","text":"<your reply to the user>"}
"""


def _emit(on_event: Callable[[dict], None] | None, event: dict[str, Any]) -> None:
    if on_event:
        on_event(sanitize_unicode_deep(event))


def _supports_native_tools(client: Any) -> bool:
    return callable(getattr(client, "chat_with_tools", None))


def _uses_ollama_tool_format(client: Any) -> bool:
    return client.__class__.__name__ == "OllamaClient"


def _react_step(
    client: Any,
    messages: list[dict[str, Any]],
    tools_desc: str,
    on_token: Callable[[str], None] | None,
) -> ChatResult:
    """JSON ReAct fallback for providers without native tool calling."""
    convo = "\n".join(
        f"{m.get('role')}: {m.get('content')}"
        for m in messages
        if m.get("role") in ("user", "assistant", "system")
    )
    user = f"Available tools:\n{tools_desc}\n\nConversation:\n{convo}\n\nNext action JSON:"
    data = client.complete_json(SYSTEM_PROMPT + REACT_PROMPT_SUFFIX, user)
    action = str(data.get("action") or "").lower()
    if action == "tool":
        name = str(data.get("name") or "")
        args = data.get("args") if isinstance(data.get("args"), dict) else {}
        return ChatResult(
            tool_calls=[ToolCall(id="react-0", name=name, arguments=args)],
        )
    text = str(data.get("text") or data.get("answer") or data.get("content") or "")
    if on_token and text:
        on_token(text)
    return ChatResult(content=text)


def _tools_description(*, compact: bool = False) -> str:
    lines = []
    for t in TOOL_DEFINITIONS:
        if compact:
            lines.append(f"- {t['name']}")
        else:
            lines.append(f"- {t['name']}: {t.get('description', '')}")
    return "\n".join(lines)


def _build_openai_messages(history: list[dict[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history:
        role = msg.get("role")
        content = strip_surrogates(str(msg.get("content") or ""))
        if role in ("user", "assistant"):
            out.append({"role": role, "content": content})
    return out


def run_agent_turn(
    messages: list[dict[str, str]],
    context: AuditToolContext,
    *,
    on_event: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """
    Run the agent loop. Emits NDJSON-style events via on_event.
    Returns final result dict with ok, message, tool_events.
    """
    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        err = "AI is disabled. Enable AI insights in the AI settings tab and configure a provider."
        _emit(on_event, {"type": "error", "message": err})
        return {"ok": False, "error": err}

    try:
        client = get_llm_client(cfg)
    except ValueError as e:
        msg = str(e)
        _emit(on_event, {"type": "error", "message": msg})
        return {"ok": False, "error": msg}

    openai_messages = _build_openai_messages(messages)
    tools = openai_tools_schema()
    tool_events: list[dict[str, Any]] = []
    final_message = ""

    def on_token(text: str) -> None:
        _emit(on_event, {"type": "token", "text": strip_surrogates(text)})

    for _round in range(MAX_TOOL_ROUNDS):
        _emit(on_event, {
            "type": "status",
            "phase": "model",
            "detail": f"Thinking (step {_round + 1}/{MAX_TOOL_ROUNDS})…",
        })
        try:
            llm_messages = sanitize_unicode_deep(openai_messages)
            if _supports_native_tools(client):
                result = client.chat_with_tools(llm_messages, tools, on_token=on_token)
            else:
                result = _react_step(client, llm_messages, _tools_description(compact=True), on_token)
        except Exception as e:
            msg = str(e).strip() or type(e).__name__
            if "httpx" in msg.lower() or "requirements-llm" in msg.lower():
                msg = (
                    "LLM dependencies are missing. Run: pip install -r requirements-llm.txt "
                    f"(or restart with ./local-run setup). Details: {msg}"
                )
            _emit(on_event, {"type": "error", "message": msg})
            return {"ok": False, "error": msg, "tool_events": tool_events}

        if result.tool_calls:
            ollama_format = _uses_ollama_tool_format(client)
            assistant_tool_calls = []
            for i, tc in enumerate(result.tool_calls):
                if ollama_format:
                    assistant_tool_calls.append({
                        "type": "function",
                        "function": {
                            "index": i,
                            "name": tc.name,
                            "arguments": sanitize_unicode_deep(tc.arguments),
                        },
                    })
                else:
                    assistant_tool_calls.append({
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                    })

            if _supports_native_tools(client):
                openai_messages.append({
                    "role": "assistant",
                    "content": strip_surrogates(result.content or ""),
                    "tool_calls": assistant_tool_calls,
                })
            else:
                openai_messages.append({
                    "role": "assistant",
                    "content": f"Calling tool {result.tool_calls[0].name}",
                })

            for tc in result.tool_calls:
                _emit(on_event, {"type": "tool_start", "name": tc.name, "args": tc.arguments})
                tool_result = sanitize_unicode_deep(
                    dispatch_tool(tc.name, tc.arguments, context=context),
                )
                _emit(on_event, {"type": "tool_end", "name": tc.name, "result": tool_result})
                tool_events.append({"name": tc.name, "args": tc.arguments, "result": tool_result})

                tool_content = json.dumps(tool_result, default=str)
                if ollama_format:
                    openai_messages.append({
                        "role": "tool",
                        "tool_name": tc.name,
                        "content": tool_content,
                    })
                else:
                    openai_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_content,
                    })
            continue

        final_message = strip_surrogates(result.content).strip()
        if final_message:
            _emit(on_event, {"type": "done", "message": final_message})
            return {"ok": True, "message": final_message, "tool_events": tool_events}

        break

    err = "Agent stopped after maximum tool rounds without a final answer."
    _emit(on_event, {"type": "error", "message": err})
    return {"ok": False, "error": err, "tool_events": tool_events}
