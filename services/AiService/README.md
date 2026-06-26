# AiService

Standalone .NET microservice for **all AI/LLM functionality** in Site Audit, built on [Microsoft.Extensions.AI](https://www.nuget.org/packages/Microsoft.Extensions.AI).

Python FastAPI retains crawl, pipeline, and integrations. AiService owns chat, structured completions, enrichment, **secrets and LLM config writes**, MCP, and audit-tool dispatch for the chat agent.

## Run locally

Prerequisites: [.NET SDK 10+](https://dotnet.microsoft.com/download), Postgres, FastAPI on port 8001 (audit-tool bridge for tools not yet native in C#).

```bash
cd services/AiService
export DATABASE_URL=postgres://postgres:dev@127.0.0.1:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8001
dotnet run --project src/AiService.Api
```

Service listens on **http://localhost:8092**. Swagger UI in Development: **http://localhost:8092/docs**.

`./local-run` starts AiService automatically (with `WP_MCP_HTTP=1`). The BFF routes browser AI requests here via `AI_SERVICE_URL` and `AI_ROUTES`.

## BFF routing (`AI_ROUTES`)

Browser clients never call AiService directly. The BFF proxies these paths (see `docker-compose.yml` / `services/Bff/src/Bff.Api/appsettings.Development.json`):

| Path | Purpose |
|------|---------|
| `/api/chat` | Property-scoped chat (SSE) |
| `/api/llm-config` | LLM provider/model and risk toggles |
| `/api/secrets` | API keys, Google OAuth app credentials, MCP token |
| `/api/ollama/status` | Local Ollama catalog |
| `/api/issues/fix-suggestion`, `/api/issues/action-plan` | Issue AI helpers |
| `/api/ai/fix-suggestion` | Legacy fix-suggestion alias |
| `/api/dashboards/ai-generate` | Dashboard AI |
| `/api/content/analyze`, `/api/content/wizard` | Content studio AI |
| `/api/links/page-coach` | Page coach |
| `/api/report/audit-tool` | Internal audit-tool dispatch (also used by tool bridge) |
| `/api/mcp-tools` | MCP tool catalog API |

## Secrets and config stores

`SecretsService` unifies **GET/PUT `/api/secrets`** across Postgres tables:

| Store | Examples |
|-------|----------|
| `llm_config` | `OPENAI_API_KEY`, `llm_enabled`, provider/model |
| `pipeline_config` | Integration keys routed from Secrets UI (e.g. `PERPLEXITY_API_KEY`) |
| `google_app_settings` | Google OAuth client ID/secret (app-wide) |

`LlmConfigRepository` **merges** partial PUT payloads so Risk Settings toggles do not wipe API keys. Per-property Google tokens remain on `properties` (Integrations UI).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres (`llm_config`, `llm_cache`, `chat_sessions`, `pipeline_config`, `google_app_settings`, `report_payload`) |
| `FASTAPI_URL` | `http://127.0.0.1:8001` | Python audit-tool bridge for unported tools |
| `AI_SERVICE_URL` | — | Used by Python worker (`ai_service_client.py`) |
| `ASPNETCORE_URLS` | `http://+:8092` | Bind address |
| `WP_MCP_HTTP` | — | Set `1` to expose MCP at `/mcp` |
| `WP_MCP_DOMAIN` | `core` | MCP tool bundle: core, crawl, google, links, full |

## Architecture

```
BFF (:8090) → AiService (:8092)
                ├─ Microsoft.Extensions.AI (OpenAI, Groq, Ollama, Anthropic, Gemini)
                ├─ SecretsService → llm_config / pipeline_config / google_app_settings
                ├─ ToolDispatcher → native C# handlers + Python bridge (369 tools)
                └─ MCP (stdio or HTTP on /mcp)
Python worker → POST /internal/enrichment/* and ai_service_client → AiService
```

## Projects

| Project | Role |
|---------|------|
| `AiService.Api` | HTTP controllers (paths match former FastAPI routes) |
| `AiService.Application` | Services, repos, chat agent, enrichment, secrets |
| `AiService.Providers` | `IChatClientFactory`, structured JSON completions |
| `AiService.Tools` | Audit tool catalog, dispatch, payload slices |
| `AiService.Mcp` | Model Context Protocol server |
| `AiService.Domain` | Entities and repository interfaces |

## OpenAPI

AiService exposes Swagger at `/docs` in Development. The web app's `web/openapi.json` is generated from **FastAPI only** — it does not include AiService routes. Use AiService Swagger or BFF proxy paths when integrating.
