using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace AiService.Mcp;

public static class McpServerExtensions
{
    /// <summary>
    /// Registers Site Audit MCP server, domain-filtered handlers, and router tools.
    /// Chain <see cref="IMcpServerBuilder.WithHttpTransport"/> or
    /// <see cref="IMcpServerBuilder.WithStdioServerTransport"/> after this call.
    /// </summary>
    public static IMcpServerBuilder AddAiServiceMcp(this IServiceCollection services)
    {
        services.AddSingleton<ToolCatalogEntryLookup>();
        services.AddSingleton<McpAuditTools>();

        return services.AddMcpServer(options =>
            {
                var domain = McpToolDomains.ResolveMcpDomain();
                options.ServerInfo = new Implementation
                {
                    Name = $"site-audit-{domain}",
                    Version = "1.0.0",
                };

                options.Handlers.ListToolsHandler = async (request, cancellationToken) =>
                {
                    var selection = request.Services!.GetRequiredService<AuditToolSelectionService>();
                    var entryLookup = request.Services!.GetRequiredService<ToolCatalogEntryLookup>();
                    var snapshot = await selection.GetSnapshotAsync(cancellationToken);
                    var tools = new List<Tool>();

                    foreach (var name in snapshot.EnabledToolNames.Order(StringComparer.Ordinal))
                    {
                        if (!entryLookup.TryGetEntry(name, out var entry))
                        {
                            continue;
                        }

                        tools.Add(new Tool
                        {
                            Name = name,
                            Description = entry.Description,
                            InputSchema = entry.InputSchema is null
                                ? JsonDocument.Parse("""{"type":"object","properties":{}}""").RootElement
                                : JsonDocument.Parse(entry.InputSchema.ToJsonString()).RootElement,
                        });
                    }

                    return new ListToolsResult { Tools = tools };
                };

                options.Handlers.CallToolHandler = async (request, cancellationToken) =>
                {
                    var auditTools = request.Services!.GetRequiredService<McpAuditTools>();
                    var selection = request.Services!.GetRequiredService<AuditToolSelectionService>();
                    var toolName = request.Params?.Name
                        ?? throw new McpException("Tool name is required.");

                    var snapshot = await selection.GetSnapshotAsync(cancellationToken);
                    if (!snapshot.EnabledToolNames.Contains(toolName))
                    {
                        var error = new JsonObject
                        {
                            ["error"] = $"tool not exposed in bundle {snapshot.BundleKey}: {toolName}",
                            ["hint"] = "Adjust mcp_domain / mcp_enabled_domains in Risk Settings or set WP_MCP_DOMAIN=full.",
                        };
                        return new CallToolResult
                        {
                            Content = [new TextContentBlock { Text = error.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) }],
                            IsError = true,
                        };
                    }

                    var argsDict = request.Params?.Arguments;
                    string? argsJson = null;
                    int? propertyId = null;
                    int? reportId = null;

                    if (argsDict is not null && argsDict.Count > 0)
                    {
                        var jsonArgs = new JsonObject();
                        foreach (var (key, value) in argsDict)
                        {
                            jsonArgs[key] = JsonNode.Parse(value.GetRawText());
                        }

                        argsJson = jsonArgs.ToJsonString();

                        if (argsDict.TryGetValue("property_id", out var pidProp)
                            && pidProp.TryGetInt32(out var pid))
                        {
                            propertyId = pid;
                        }

                        if (argsDict.TryGetValue("report_id", out var ridProp)
                            && ridProp.TryGetInt32(out var rid))
                        {
                            reportId = rid;
                        }
                    }

                    var text = await auditTools.DispatchNamedToolAsync(
                        toolName,
                        argsJson,
                        propertyId,
                        reportId,
                        cancellationToken);

                    return new CallToolResult
                    {
                        Content = [new TextContentBlock { Text = text }],
                    };
                };
            })
            .WithTools<McpAuditTools>();
    }

    /// <summary>Maps MCP Streamable HTTP endpoints at <paramref name="pattern"/>.</summary>
    public static IEndpointConventionBuilder MapAiServiceMcp(this IEndpointRouteBuilder endpoints, string pattern = "/mcp")
        => endpoints.MapMcp(pattern);

    /// <summary>Returns true when <c>WP_MCP_HTTP=1</c>.</summary>
    public static bool IsMcpHttpEnabled()
        => string.Equals(Environment.GetEnvironmentVariable("WP_MCP_HTTP"), "1", StringComparison.Ordinal);

    /// <summary>
    /// Configures a stdio MCP host. Use from a dedicated console entry point:
    /// <code>
    /// var builder = Host.CreateApplicationBuilder(args);
    /// builder.AddAiServiceMcpStdioHost();
    /// await builder.Build().RunAsync();
    /// </code>
    /// </summary>
    public static IHostApplicationBuilder AddAiServiceMcpStdioHost(this IHostApplicationBuilder builder)
    {
        builder.Logging.AddConsole(console =>
        {
            console.LogToStandardErrorThreshold = LogLevel.Trace;
        });

        builder.Services.AddAiServiceApplication();
        builder.Services.AddAiServiceMcp().WithStdioServerTransport();
        return builder;
    }
}
