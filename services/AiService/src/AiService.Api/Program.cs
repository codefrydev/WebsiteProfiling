using AiService.Api;
using AiService.Mcp;
using WebsiteProfiling.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling AI API",
    "Internal AI service: chat (SSE), LLM settings, secrets, audit-tool bridge, content AI, "
    + "and MCP tools. Reached by the BFF via AI_ROUTES.");

builder.Services.AddAiServiceHost(enableMcpHttp: McpServerExtensions.IsMcpHttpEnabled());

var app = builder.Build();

app.UseWebsiteProfilingSwaggerUi("Website Profiling AI API");

app.MapControllers();

app.MapGet("/", () => Results.Ok(new
{
    service = "AiService",
    mcp_http = McpServerExtensions.IsMcpHttpEnabled(),
    mcp_path = McpServerExtensions.IsMcpHttpEnabled() ? "/mcp" : null,
    mcp_domain = Environment.GetEnvironmentVariable("WP_MCP_DOMAIN") ?? "core",
    mcp_stdio = "Use a separate console host: Host.CreateApplicationBuilder(args).AddAiServiceMcpStdioHost().Build().RunAsync()",
}));

if (McpServerExtensions.IsMcpHttpEnabled())
{
    // MapAiServiceMcp is declared to return IEndpointConventionBuilder (no AddEndpointFilter
    // extension targets that interface directly), but MapMcp's actual implementation returns a
    // RouteGroupBuilder — cast to reach the concrete AddEndpointFilter overload.
    ((RouteGroupBuilder)app.MapAiServiceMcp("/mcp")).AddEndpointFilter<McpBearerAuthFilter>();
}

app.Run();

public partial class Program;
