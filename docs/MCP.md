# Site Audit MCP server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) tools for querying audit data from Cursor, Claude Desktop, or other MCP clients.

## Install

```bash
pip install -r requirements-mcp.txt
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling
export PYTHONPATH=src
```

## Cursor configuration

Add to `.cursor/mcp.json` (or Cursor MCP settings):

```json
{
  "mcpServers": {
    "site-audit": {
      "command": "python",
      "args": ["-m", "website_profiling.mcp"],
      "env": {
        "DATABASE_URL": "postgres://profiling:profiling@localhost:5432/website_profiling",
        "PYTHONPATH": "src",
        "WP_PROPERTY_ID": "1"
      }
    }
  }
}
```

`WP_PROPERTY_ID` sets the default property when tools omit `property_id`.

## Available tools

| Tool | Description |
|------|-------------|
| `list_properties` | All configured properties |
| `get_property` | One property by ID |
| `get_report_summary` | Health score, issue counts, crawl stats |
| `list_issues` | Filtered audit issues (max 50) |
| `search_pages` | Crawl pages by status or URL (max 30) |
| `get_page_details` | Crawl + Lighthouse + GSC for one URL |
| `get_lighthouse_summary` | Site-wide Lighthouse overview |
| `get_keyword_summary` | Top keywords for a property |
| `get_google_summary` | GSC/GA4 headline metrics |
| `get_health_history` | Health score snapshots over time |

All tools are **read-only** in v1.

## In-app chat

The same tools power **AI Chat** at [http://localhost:3000/chat](http://localhost:3000/chat). Enable AI in Run audit → AI settings.

## Ollama note

Local Ollama models use a JSON ReAct fallback (no native function calling). OpenAI and Anthropic providers use native tool calling with streaming in the chat UI.
