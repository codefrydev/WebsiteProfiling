using System.Net;
using System.Text.Json;
using FileService.Application.Clients;
using FileService.Application.Options;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FileService.Tests;

public class ReportDataClientTests
{
    private static ReportDataClient CreateClient(HttpClient http) =>
        new(http, Options.Create(new ReportApiOptions { BaseUrl = "http://report-api.test", TimeoutSeconds = 30 }),
            NullLogger<ReportDataClient>.Instance);

    [Fact]
    public async Task ListReportsAsync_parses_meta_response()
    {
        using var http = TestHttpHandler.CreateClient(_ =>
            TestHttpHandler.Json("""{"reports":[{"id":3,"canonical_domain":"ex.com","site_name":"Ex","generated_at":"2025-01-01"}]}"""));
        var client = CreateClient(http);

        var rows = await client.ListReportsAsync();

        Assert.Single(rows);
        Assert.Equal(3, rows[0].Id);
        Assert.Equal("ex.com", rows[0].CanonicalDomain);
    }

    [Fact]
    public async Task ListReportsAsync_returns_empty_when_reports_missing()
    {
        using var http = TestHttpHandler.CreateClient(_ => TestHttpHandler.Json("{}"));
        var client = CreateClient(http);

        var rows = await client.ListReportsAsync();

        Assert.Empty(rows);
    }

    [Fact]
    public async Task GetPayloadAsync_returns_payload_element()
    {
        using var http = TestHttpHandler.CreateClient(_ =>
            TestHttpHandler.Json("""{"payload":{"site_name":"Acme"}}"""));
        var client = CreateClient(http);

        var payload = await client.GetPayloadAsync(9);

        Assert.NotNull(payload);
        Assert.Equal("Acme", payload.Value.GetProperty("site_name").GetString());
    }

    [Fact]
    public async Task GetPayloadAsync_returns_null_on_404()
    {
        using var http = TestHttpHandler.CreateClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var client = CreateClient(http);

        var payload = await client.GetPayloadAsync(404);

        Assert.Null(payload);
    }

    [Fact]
    public async Task GetPayloadAsync_returns_null_when_payload_property_missing()
    {
        using var http = TestHttpHandler.CreateClient(_ => TestHttpHandler.Json("{}"));
        var client = CreateClient(http);

        var payload = await client.GetPayloadAsync(1);

        Assert.Null(payload);
    }

    [Fact]
    public async Task ListReportsAsync_throws_on_upstream_error()
    {
        using var http = TestHttpHandler.CreateClient(_ => new HttpResponseMessage(HttpStatusCode.BadGateway)
        {
            Content = new StringContent("upstream down"),
        });
        var client = CreateClient(http);

        var ex = await Assert.ThrowsAsync<HttpRequestException>(() => client.ListReportsAsync());
        Assert.Contains("502", ex.Message);
    }
}
