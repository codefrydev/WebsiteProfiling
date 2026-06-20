"""Agent loop for in-app chat and MCP — tool calling with streaming events."""
from __future__ import annotations

import json
import os
from typing import Any, Callable

from ..concurrency import map_parallel, tool_concurrency
from ..llm_config import llm_is_enabled, load_llm_config_from_db
from ..text_sanitize import sanitize_unicode_deep, strip_surrogates
from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.crawl_actions import CHAT_CRAWL_TOOL
from ..tools.audit_tools.registry import (
    TOOL_DEFINITIONS,
    _normalize_tool_args,
    dispatch_tool,
    openai_tools_schema,
)
from ..tools.audit_tools.tool_selector import (
    apply_tool_cap,
    chat_tool_mode,
    chat_tool_search_cap,
    select_tools_for_turn,
)
from .base import ChatResult, ToolCall, get_llm_client
from .chat_narrative import ChatNarrativeError, synthesize_chat_narrative

MAX_TOOL_ROUNDS_DEFAULT = 10
MAX_TOOL_ROUNDS_EXTENDED = 100
# Back-compat for tests and imports
MAX_TOOL_ROUNDS = MAX_TOOL_ROUNDS_DEFAULT


def _truthy_cfg(cfg: dict[str, str], key: str) -> bool:
    return str(cfg.get(key, "")).lower() in ("true", "1", "yes")


def _max_tool_rounds(cfg: dict[str, str]) -> int:
    """Resolve per-turn tool loop cap from llm_config and optional env overrides."""
    if _truthy_cfg(cfg, "llm_chat_unlimited_tool_rounds"):
        raw = (os.environ.get("CHAT_MAX_TOOL_ROUNDS_EXTENDED") or "").strip()
        if raw:
            try:
                return max(1, int(raw))
            except ValueError:
                pass
        return MAX_TOOL_ROUNDS_EXTENDED
    raw = (os.environ.get("CHAT_MAX_TOOL_ROUNDS") or "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return MAX_TOOL_ROUNDS_DEFAULT

NARRATIVE_FAILED_MSG = "Could not generate a summary. Tool results are shown below."

_SYSTEM_PROMPT_BASE = """You are Site Audit AI, a technical SEO assistant for a self-hosted site audit platform.
You help users understand crawl results, audit issues, Lighthouse scores, keywords, and Search Console data.

Tool routing (only a subset of tools is loaded each turn):
- Always available: search_audit_tools, list_tool_domains, get_data_coverage_report, run_insight_workflow, run_technical_workflow, run_keyword_workflow, run_domain_agent, plus top insight tools (get_report_summary, get_opportunity_matrix, get_traffic_health_check, etc.)
- Use search_audit_tools(query) to discover specialized tools by topic (e.g. "broken links", "GSC CTR", "export PDF").
- Use list_tool_domains to see domain groupings and example prompts.
- Use run_*_workflow for common multi-step analyses (insight, technical, keyword).
- Use run_domain_agent(task, domain) for deep exploration within one domain.
- Use get_data_coverage_report when tools return empty or missing data.

Image playbook:
- Overview: get_image_audit_summary first — the UI renders summary cards, page preview lists (alt/lazy/OG/dimensions), and Lighthouse image findings. Call tools only; the app generates user-facing narrative separately.
- Missing alt / lazy / OG / dimensions: get_image_audit_summary includes previews; call list_pages_* only if the user wants the full exportable list
- All image URLs: list_site_image_urls (optional kind filter)
- Lighthouse image issues: list_lighthouse_image_opportunities
- Largest / heavy files: list_largest_images (requires probe_image_inventory=true on report build)
- Unoptimized format/size: list_unoptimized_images (requires image inventory probe)
- What needs attention: list_images_needing_attention
- Export lists: export_list_as_csv with the matching list tool

Export playbook (chat UI shows download buttons after export tools — do not paste file contents):
- Full audit PDF/HTML/CSV/JSON: export_audit_report with format pdf|html|csv|json
- Compare issue diff CSV: export_compare_csv with baseline_report_id
- Export a list as CSV: export_list_as_csv with tool_name and tool_args (e.g. list_broken_links)
- After export tools succeed, tell the user their download is ready; the UI renders file buttons automatically

Visualization playbook (chat UI renders charts and tables from tool JSON automatically):
- Category scores / health: get_category_scores, list_audit_categories, or get_report_summary
- Issue breakdown: get_report_summary, get_issue_priority_breakdown (priority chart), and list_issues or get_critical_issues for the table
- Top critical issues (required trio): get_report_summary, get_issue_priority_breakdown, get_critical_issues — then only write recommendations, never enumerate issues in prose
- Audit overview / site health recap: get_report_summary (health, crawl, categories, issue counts). Keep prose to interpretation and next steps only — never repeat health score, URL counts, success rate, category scores, or priority counts in markdown; the UI renders those as cards and charts.
- Distributions: get_mime_type_breakdown, get_title_length_distribution, get_domain_link_distribution, get_status_code_breakdown, get_depth_distribution
- Trends over time: get_health_history, get_category_health_history
- Compare drift: compare_category_deltas, compare_issue_deltas, compare_google_metrics, compare_security_deltas
- Lighthouse: get_lighthouse_summary
- Google/GSC: get_google_summary, get_gsc_top_queries

SQL playbook (only when get_sql_schema / run_sql_query are available):
- SQL is a fallback for custom questions not answerable by the named audit tools above. Always prefer a named tool first.
- When SQL is needed: call get_sql_schema first to discover tables and foreign keys, then run_sql_query with a single read-only SELECT.
- Only SELECT is allowed — the tool rejects INSERT/UPDATE/DELETE/DDL.
- The tool automatically scopes queries to the active property; you do not need to add a property_id filter manually. For crawl data, scope is applied through crawl_runs.
- Use row_cap intentionally: set a small value (10-50) for row listings and omit it (default 200) for aggregates.
- Keep results concise — use LIMIT, GROUP BY, and aggregate functions. Avoid SELECT *.
- Never tell the user you cannot run SQL if run_sql_query is loaded — use it.

Rules:
- Use the provided tools to query real audit data. Do not invent URLs, scores, or metrics.
- When citing issues, include the URL when available.
- The chat UI automatically renders charts, gauges, and tables from tool results. Never tell the user you cannot show graphs or charts, and never send them to other app pages for data you can fetch with tools.
- For visual or chart requests, always call the appropriate tools first, then give a short interpretation (2–4 sentences) with recommendations.
- When tools return issue lists, scores, or breakdowns, do not re-list them in prose—the UI renders structured blocks from tool data.
- Do not emit markdown headings, bullet lists, or pipe tables for the user. The app synthesizes the final narrative from tool results.
- After gathering enough data via tools, stop calling tools. A brief internal acknowledgment is enough; user-facing text is generated separately.
- Do not repeat health scores, URL counts, success rates, category scores, priority counts, or URL lists when the UI already shows them in cards or tables.
- Never mention internal tool names (e.g. run_technical_workflow, export_audit_report) in user-facing text.
- Do not pass property_id or report_id in tool calls — they are injected from the active chat property.
- If data is missing, say what integration or crawl step is needed (briefly; narrative will be expanded separately).
"""

_SYSTEM_PROMPT_READONLY_SUFFIX = """
- You are read-only: you cannot run crawls or change settings.
"""

_SYSTEM_PROMPT_CRAWL_SUFFIX = """
Crawl playbook (when user asks to crawl, audit, or re-run a site):
- Clarify: new vs existing property, default vs custom configuration.
- Default: pick crawl preset (starter, spa, ecommerce, performance) and pipeline mode (full-audit or crawl-only).
- Custom: ask only high-impact overrides — max_pages, crawl_render_mode (static/auto/javascript), run_lighthouse_on_pages, concurrency.
- After collecting answers, always call prepare_audit_run to build a preview — never claim a crawl has started.
- The chat UI shows a confirm card; wait for the user to authorize and click Run before assuming the audit began.
- If prepare_audit_run returns job_running, tell the user an audit is already in progress.
"""

SYSTEM_PROMPT_READONLY = _SYSTEM_PROMPT_BASE + _SYSTEM_PROMPT_READONLY_SUFFIX
SYSTEM_PROMPT_CRAWL_ENABLED = _SYSTEM_PROMPT_BASE + _SYSTEM_PROMPT_CRAWL_SUFFIX
# Back-compat for tests and imports
SYSTEM_PROMPT = SYSTEM_PROMPT_READONLY


def _chat_allow_crawl(cfg: dict[str, str]) -> bool:
    return _truthy_cfg(cfg, "llm_chat_allow_crawl")


def resolve_system_prompt(cfg: dict[str, str]) -> str:
    return SYSTEM_PROMPT_CRAWL_ENABLED if _chat_allow_crawl(cfg) else SYSTEM_PROMPT_READONLY

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
    *,
    system_prompt: str,
) -> ChatResult:
    """JSON ReAct fallback for providers without native tool calling."""
    # Include "tool" messages so the model sees prior tool results; otherwise it
    # keeps re-issuing the same call and loops until MAX_TOOL_ROUNDS.
    convo = "\n".join(
        f"{m.get('role')}: {m.get('content')}"
        for m in messages
        if m.get("role") in ("user", "assistant", "system", "tool")
    )
    user = f"Available tools:\n{tools_desc}\n\nConversation:\n{convo}\n\nNext action JSON:"
    data = client.complete_json(system_prompt + REACT_PROMPT_SUFFIX, user)
    action = str(data.get("action") or "").lower()
    if action == "tool":
        name = str(data.get("name") or "")
        args = data.get("args") if isinstance(data.get("args"), dict) else {}
        return ChatResult(
            tool_calls=[ToolCall(id="react-0", name=name, arguments=args)],
        )
    text = str(data.get("text") or data.get("answer") or data.get("content") or "")
    return ChatResult(content=text)


def _tools_description(*, names: set[str] | None = None, compact: bool = False) -> str:
    lines = []
    for t in TOOL_DEFINITIONS:
        if names is not None and t["name"] not in names:
            continue
        if compact:
            lines.append(f"- {t['name']}")
        else:
            lines.append(f"- {t['name']}: {t.get('description', '')}")
    return "\n".join(lines)


def _last_user_message(messages: list[dict[str, str]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content") or "")
    return ""


def _expand_active_tools_from_result(
    tc_name: str,
    tool_result: dict[str, Any],
    active: set[str],
) -> set[str]:
    expanded = set(active)
    pinned: set[str] = set()

    if tc_name == "search_audit_tools":
        names = tool_result.get("tool_names")
        if isinstance(names, list):
            for name in names[:12]:
                if isinstance(name, str) and name:
                    expanded.add(name)
                    pinned.add(name)
    elif tc_name == "run_domain_agent":
        names = tool_result.get("tools_used")
        if isinstance(names, list):
            for name in names:
                if isinstance(name, str) and name:
                    expanded.add(name)
                    pinned.add(name)

    if chat_tool_mode() != "full" and pinned:
        expanded = apply_tool_cap(expanded, chat_tool_search_cap(), pinned=pinned)
    return expanded


def _build_openai_messages(
    history: list[dict[str, str]],
    system_prompt: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for msg in history:
        role = msg.get("role")
        content = strip_surrogates(str(msg.get("content") or ""))
        if role in ("user", "assistant"):
            out.append({"role": role, "content": content})
    return out


def _finish_with_narrative(
    cfg: dict[str, str],
    user_message: str,
    tool_events: list[dict[str, Any]],
    on_event: Callable[[dict], None] | None,
    *,
    partial_note: str | None = None,
) -> dict[str, Any]:
    if partial_note:
        _emit(on_event, {"type": "partial_done", "message": partial_note})

    def on_status(phase: str) -> None:
        detail = "Retrying summary…" if phase == "retrying" else "Summarizing insights…"
        _emit(on_event, {"type": "status", "phase": "synthesizing", "detail": detail})

    try:
        narrative = synthesize_chat_narrative(
            cfg,
            user_message,
            tool_events,
            on_status=on_status,
        )
    except ChatNarrativeError:
        _emit(on_event, {"type": "error", "message": NARRATIVE_FAILED_MSG})
        return {
            "ok": False,
            "error": NARRATIVE_FAILED_MSG,
            "tool_events": tool_events,
        }

    _emit(on_event, {"type": "narrative", "narrative": narrative})
    _emit(on_event, {"type": "done"})
    return {"ok": True, "tool_events": tool_events, "narrative": narrative}


def run_agent_turn(
    messages: list[dict[str, str]],
    context: AuditToolContext,
    *,
    on_event: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """
    Run the agent loop. Emits NDJSON-style events via on_event.
    Returns final result dict with ok, tool_events, and narrative on success.
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

    system_prompt = resolve_system_prompt(cfg)
    openai_messages = _build_openai_messages(messages, system_prompt)
    last_user = _last_user_message(messages)
    active_names = select_tools_for_turn(last_user, messages)
    if _chat_allow_crawl(cfg):
        active_names.add(CHAT_CRAWL_TOOL)
    tools = openai_tools_schema(active_names, context_scoped=True)
    tool_events: list[dict[str, Any]] = []
    max_rounds = _max_tool_rounds(cfg)
    partial_note: str | None = None

    for _round in range(max_rounds):
        _emit(on_event, {
            "type": "status",
            "phase": "model",
            "detail": f"Thinking (step {_round + 1}/{max_rounds})…",
        })
        try:
            llm_messages = sanitize_unicode_deep(openai_messages)
            if _supports_native_tools(client):
                result = client.chat_with_tools(llm_messages, tools, on_token=None)
            else:
                result = _react_step(
                    client,
                    llm_messages,
                    _tools_description(names=active_names, compact=True),
                    None,
                    system_prompt=system_prompt,
                )
        except Exception as e:
            msg = str(e).strip() or type(e).__name__
            if "Connection error" in msg and (cfg.get("llm_provider") or "").strip().lower() == "groq":
                msg = (
                    "Could not reach Groq. Check your Groq API key on the Secrets page and "
                    "that outbound HTTPS to api.groq.com is allowed. "
                    f"Details: {msg}"
                )
            elif "httpx" in msg.lower() or "requirements.txt" in msg.lower():
                msg = (
                    "LLM dependencies are missing. Run: pip install -r requirements.txt "
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

            # Parallel tool execution (Claude Code-style): independent, read-only tool
            # calls in a single turn run concurrently on a bounded pool. Each dispatch
            # opens its own pooled DB connection, AuditToolContext is immutable, and
            # results are applied back in request order so OpenAI tool_call_id / Anthropic
            # tool_use_id pairing stays correct.
            for tc in result.tool_calls:
                _emit(on_event, {"type": "tool_start", "name": tc.name, "args": tc.arguments})

            gated = chat_tool_mode() != "full"
            pre_round_active = set(active_names)

            def _run_tool(tc: ToolCall) -> dict[str, Any]:
                if gated and tc.name not in pre_round_active:
                    return {
                        "error": f"tool not loaded this turn: {tc.name}",
                        "hint": "Call search_audit_tools to load specialized tools, or rephrase your request.",
                    }
                tool_args = _normalize_tool_args(tc.arguments)
                try:
                    return sanitize_unicode_deep(
                        dispatch_tool(tc.name, tool_args, context=context),
                    )
                except Exception as e:  # noqa: BLE001 - isolate one tool's failure from the batch
                    return {"error": str(e).strip() or type(e).__name__}

            results = map_parallel(
                result.tool_calls, _run_tool, max_workers=tool_concurrency(),
            )

            for tc, tool_result in zip(result.tool_calls, results):
                _emit(on_event, {"type": "tool_end", "name": tc.name, "result": tool_result})
                tool_events.append({"name": tc.name, "args": tc.arguments, "result": tool_result})
                active_names = _expand_active_tools_from_result(tc.name, tool_result, active_names)

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

            if gated:
                tools = openai_tools_schema(active_names, context_scoped=True)
            continue

        break
    else:
        if tool_events:
            partial_note = (
                f"The agent completed {len(tool_events)} tool step(s) but did not finish "
                "all planned steps. Tool results are preserved below."
            )

    return _finish_with_narrative(
        cfg,
        last_user,
        tool_events,
        on_event,
        partial_note=partial_note,
    )
