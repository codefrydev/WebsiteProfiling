using AiService.Application;
using AiService.Mcp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddAiServiceApplication();
builder.Services.AddAiServiceMcpCatalog();

if (McpServerExtensions.IsMcpHttpEnabled())
{
    builder.Services
        .AddAiServiceMcp()
        .WithHttpTransport(options => options.Stateless = true);
}

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
