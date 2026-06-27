using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using WebsiteProfiling.Testing;

namespace Data.Tests;

/// <summary>Postgres integration tests for /api/properties/* (replaces Python FastAPI tests).</summary>
public class PropertiesIntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _factory;
    private HttpClient? _client;
    private long? _createdPropertyId;
    private bool _dbReady;

    public PropertiesIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
    }

    private static bool Skip => !PostgresIntegration.IsConfigured;

    public async Task InitializeAsync()
    {
        if (Skip || !await PostgresIntegration.CanConnectAsync())
        {
            return;
        }

        _dbReady = true;
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        if (_client is null)
        {
            return;
        }

        if (_createdPropertyId is not null)
        {
            await _client.DeleteAsync($"/api/properties/{_createdPropertyId.Value}");
        }

        _client.Dispose();
    }

    [Fact]
    public async Task Properties_crud_and_ops_roundtrip()
    {
        if (Skip || !_dbReady)
        {
            return;
        }
        var domain = $"api-prop-{Guid.NewGuid():N}"[..22] + ".example";

        var create = await _client!.PostAsJsonAsync(
            "/api/properties",
            new { name = "Props API", canonicalDomain = domain, siteUrl = $"https://{domain}" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        using var createDoc = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var propertyId = createDoc.RootElement.GetProperty("id").GetInt64();
        _createdPropertyId = propertyId;
        Assert.Equal(domain, createDoc.RootElement.GetProperty("canonical_domain").GetString());

        var listing = await _client.GetAsync("/api/properties");
        Assert.Equal(HttpStatusCode.OK, listing.StatusCode);
        using var listDoc = JsonDocument.Parse(await listing.Content.ReadAsStringAsync());
        var ids = listDoc.RootElement.GetProperty("properties").EnumerateArray()
            .Select(p => p.GetProperty("id").GetInt64())
            .ToHashSet();
        Assert.Contains(propertyId, ids);

        var opsPut = await _client.PutAsJsonAsync(
            $"/api/properties/{propertyId}/ops",
            new
            {
                scheduleCron = "0 9 * * 1",
                alertWebhookUrl = "https://hooks.example/alert",
                alertEmail = "ops@example.com",
            });
        Assert.Equal(HttpStatusCode.OK, opsPut.StatusCode);

        var opsGet = await _client.GetAsync($"/api/properties/{propertyId}/ops");
        Assert.Equal(HttpStatusCode.OK, opsGet.StatusCode);
        using var opsDoc = JsonDocument.Parse(await opsGet.Content.ReadAsStringAsync());
        Assert.Equal("0 9 * * 1", opsDoc.RootElement.GetProperty("schedule_cron").GetString());

        var presetPut = await _client.PutAsJsonAsync(
            $"/api/properties/{propertyId}/preset",
            new { preset = "quick" });
        Assert.Equal(HttpStatusCode.OK, presetPut.StatusCode);
    }

    [Fact]
    public async Task Properties_resolve_does_not_create_partial_domains()
    {
        if (Skip || !_dbReady)
        {
            return;
        }

        var before = await _client!.GetAsync("/api/properties");
        using var beforeDoc = JsonDocument.Parse(await before.Content.ReadAsStringAsync());
        var countBefore = beforeDoc.RootElement.GetProperty("properties").GetArrayLength();

        var partial = await _client.GetAsync("/api/properties/resolve?startUrl=https://code");
        Assert.Equal(HttpStatusCode.OK, partial.StatusCode);
        using var partialDoc = JsonDocument.Parse(await partial.Content.ReadAsStringAsync());
        Assert.True(partialDoc.RootElement.GetProperty("id").ValueKind == JsonValueKind.Null);

        var after = await _client.GetAsync("/api/properties");
        using var afterDoc = JsonDocument.Parse(await after.Content.ReadAsStringAsync());
        Assert.Equal(countBefore, afterDoc.RootElement.GetProperty("properties").GetArrayLength());
    }

    [Fact]
    public async Task Properties_ensure_and_resolve()
    {
        if (Skip || !_dbReady)
        {
            return;
        }

        var domain = $"ensure-{Guid.NewGuid():N}"[..14] + ".example";
        var url = $"https://{domain}/";

        var created = await _client!.PostAsJsonAsync("/api/properties/ensure", new { startUrl = url });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        using var createDoc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var propertyId = createDoc.RootElement.GetProperty("id").GetInt64();
        _createdPropertyId = propertyId;

        var resolved = await _client.GetAsync($"/api/properties/resolve?startUrl={Uri.EscapeDataString(url)}");
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        using var resolveDoc = JsonDocument.Parse(await resolved.Content.ReadAsStringAsync());
        Assert.Equal(propertyId, resolveDoc.RootElement.GetProperty("id").GetInt64());
    }
}
