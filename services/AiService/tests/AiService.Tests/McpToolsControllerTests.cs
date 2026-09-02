using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using WebsiteProfiling.Testing;

namespace AiService.Tests;

[Collection("WebHostIntegration")]
public sealed class McpToolsControllerTests
{
    [Fact]
    public async Task Get_mcp_tools_returns_catalog_json()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();

        await using var factory = new WebApplicationFactory<Api.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/mcp-tools");

        response.EnsureSuccessStatusCode();
        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
        Assert.NotNull(json);
        Assert.NotNull(json["tools"]);
        Assert.NotNull(json["domains"]);
    }
}
