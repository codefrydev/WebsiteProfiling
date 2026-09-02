namespace AiService.Api.Application.Mcp;

/// <summary>Shared IMemoryCache keys for MCP HTTP auth (see AiService.Mcp.McpBearerAuthFilter).</summary>
public static class McpAuthCacheKeys
{
    public const string BearerToken = "mcp-bearer-token";
}
