using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ReportService.Tests;

/// <summary>Postgres integration tests for /api/dashboards/* (replaces Python FastAPI tests).</summary>
public class DashboardsIntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _factory;
    private HttpClient? _client;
    private long? _propertyId;
    private long? _dashboardId;

    public DashboardsIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
    }

    private static bool Skip => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL"));

    public async Task InitializeAsync()
    {
        if (Skip)
        {
            return;
        }

        _client = _factory.CreateClient();
        var domain = $"dash-{Guid.NewGuid():N}"[..18] + ".example";
        await using var conn = new Npgsql.NpgsqlConnection(Environment.GetEnvironmentVariable("DATABASE_URL"));
        await conn.OpenAsync();
        await using var cmd = new Npgsql.NpgsqlCommand(
            """
            INSERT INTO properties (name, canonical_domain, site_url)
            VALUES (@name, @domain, @url)
            RETURNING id
            """,
            conn);
        cmd.Parameters.AddWithValue("name", "Dashboard integration");
        cmd.Parameters.AddWithValue("domain", domain);
        cmd.Parameters.AddWithValue("url", $"https://{domain}");
        _propertyId = (long)(await cmd.ExecuteScalarAsync() ?? 0L);
    }

    public async Task DisposeAsync()
    {
        if (Skip || _client is null)
        {
            return;
        }

        if (_dashboardId is not null && _propertyId is not null)
        {
            await _client.DeleteAsync($"/api/dashboards/{_dashboardId}?propertyId={_propertyId}");
        }

        if (_propertyId is not null)
        {
            await using var conn = new Npgsql.NpgsqlConnection(Environment.GetEnvironmentVariable("DATABASE_URL"));
            await conn.OpenAsync();
            await using var cmd = new Npgsql.NpgsqlCommand(
                "DELETE FROM properties WHERE id = @id",
                conn);
            cmd.Parameters.AddWithValue("id", _propertyId.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        _client.Dispose();
    }

    [Fact]
    public async Task Dashboards_crud_roundtrip()
    {
        if (Skip || _propertyId is null or <= 0)
        {
            return;
        }

        var create = await _client!.PostAsJsonAsync(
            "/api/dashboards",
            new
            {
                propertyId = _propertyId.Value,
                name = "Integration dashboard",
                layoutJson = new { version = 2, widgets = Array.Empty<object>(), slicers = Array.Empty<object>() },
            });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        using var createDoc = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var dashboardId = createDoc.RootElement.GetProperty("dashboard").GetProperty("id").GetInt64();
        _dashboardId = dashboardId;

        var listed = await _client.GetAsync($"/api/dashboards?propertyId={_propertyId}");
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        using var listDoc = JsonDocument.Parse(await listed.Content.ReadAsStringAsync());
        var ids = listDoc.RootElement.GetProperty("dashboards").EnumerateArray()
            .Select(d => d.GetProperty("id").GetInt64())
            .ToHashSet();
        Assert.Contains(dashboardId, ids);

        var updated = await _client.PutAsJsonAsync(
            $"/api/dashboards/{dashboardId}",
            new { propertyId = _propertyId.Value, name = "Renamed dashboard" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        using var updateDoc = JsonDocument.Parse(await updated.Content.ReadAsStringAsync());
        Assert.Equal("Renamed dashboard", updateDoc.RootElement.GetProperty("dashboard").GetProperty("name").GetString());
    }
}
