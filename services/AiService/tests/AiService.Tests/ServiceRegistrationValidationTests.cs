using AiService.Application.Services;
using AiService.Mcp;
using AiService.Tools.Selection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace AiService.Tests;

/// <summary>
/// Builds the real ASP.NET host with ValidateOnBuild/ValidateScopes so DI lifetime
/// mistakes (singleton consuming scoped DbContext) fail in CI, not only at ./local-run.
/// </summary>
[Collection("WebHostIntegration")]
public sealed class ServiceRegistrationValidationTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Web_host_resolves_core_services(bool enableMcpHttp)
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();
        env.Set("WP_MCP_HTTP", enableMcpHttp ? "1" : null);

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        factory.Services.GetRequiredService<AuditToolSelectionService>();
        factory.Services.GetRequiredService<McpToolCatalogService>();
        if (enableMcpHttp)
        {
            factory.Services.GetRequiredService<McpAuditTools>();
        }

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ChatAgentService>();
        scope.ServiceProvider.GetRequiredService<SecretsService>();
    }
}
