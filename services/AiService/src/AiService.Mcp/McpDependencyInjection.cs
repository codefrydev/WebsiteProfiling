using AiService.Tools.Registry;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Mcp;

public static class McpDependencyInjection
{
    /// <summary>Registers MCP catalog services used by <c>GET /api/mcp-tools</c>.</summary>
    public static IServiceCollection AddAiServiceMcpCatalog(this IServiceCollection services)
    {
        services.AddSingleton<ToolCatalogEntryLookup>();
        services.AddSingleton<McpToolCatalogService>();
        return services;
    }
}
