using AiService.Api;
using AiService.Mcp;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

builder.Services.AddAiServiceHost(enableMcpHttp: McpServerExtensions.IsMcpHttpEnabled());

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling AI API",
        Version = "v1",
        Description =
            "Internal AI service: chat (SSE), LLM settings, secrets, audit-tool bridge, content AI, "
            + "and MCP tools. Reached by the BFF via AI_ROUTES.",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling AI API v1");
        options.RoutePrefix = "docs";
    });
}

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
