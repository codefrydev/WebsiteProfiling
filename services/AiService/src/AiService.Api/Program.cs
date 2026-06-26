using AiService.Api;
using AiService.Mcp;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

builder.Services.AddAiServiceHost(enableMcpHttp: McpServerExtensions.IsMcpHttpEnabled());

var app = builder.Build();

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
    app.MapAiServiceMcp("/mcp");
}

app.Run();

public partial class Program;
