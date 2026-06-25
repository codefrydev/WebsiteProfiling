# AiService

Standalone .NET microservice for **all AI/LLM functionality** in Site Audit, built on [Microsoft.Extensions.AI](https://www.nuget.org/packages/Microsoft.Extensions.AI).

Python FastAPI retains crawl, pipeline, and integrations. AiService owns chat, structured completions, enrichment, MCP, and LLM config.

## Run locally

Prerequisites: [.NET SDK 10+](https://dotnet.microsoft.com/download), Postgres, FastAPI on port 8001 (for audit-tool bridge until all 369 tools are native C#).

```bash
cd services/AiService
export DATABASE_URL=postgres://postgres:dev@127.0.0.1:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8001
dotnet run --project src/AiService.Api
```

Service listens on **http://localhost:8092**. Swagger UI in Development: **http://localhost:8092/docs**.

The BFF routes browser AI requests here via `AI_SERVICE_URL` and `AI_ROUTES`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres (llm_config, llm_cache, chat_sessions, report_payload) |
| `FASTAPI_URL` | `http://127.0.0.1:8001` | Python audit-tool bridge for unported tools |
| `AI_SERVICE_URL` | — | Used by Python worker (`llm_client_http.py`) |
| `ASPNETCORE_URLS` | `http://+:8092` | Bind address |
| `WP_MCP_HTTP` | — | Set `1` to expose MCP at `/mcp` |
| `WP_MCP_DOMAIN` | `core` | MCP tool bundle: core, crawl, google, links, full |

## Architecture

```
BFF (:8090) → AiService (:8092)
                ├─ Microsoft.Extensions.AI (OpenAI, Groq, Ollama, Anthropic, Gemini)
                ├─ ToolDispatcher → native C# handlers + Python bridge (369 tools)
                └─ MCP (stdio or HTTP)
Python worker → POST /internal/enrichment/*
```

## Projects

| Project | Role |
|---------|------|
| `AiService.Api` | HTTP controllers matching FastAPI paths |
| `AiService.Application` | Services, repos, chat agent, enrichment |
| `AiService.Providers` | `IChatClientFactory`, structured JSON completions |
| `AiService.Tools` | Audit tool catalog, dispatch, payload slices |
| `AiService.Mcp` | Model Context Protocol server |
| `AiService.Domain` | Entities and repository interfaces |
