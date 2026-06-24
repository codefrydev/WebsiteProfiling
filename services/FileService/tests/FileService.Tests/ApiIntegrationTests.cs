using System.Net;
using System.Text.Json;
using FileService.Application.Clients;
using FileService.Domain.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FileService.Tests;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IReportDataClient>();
                services.RemoveAll<IAppSettingsClient>();
                services.AddSingleton<IReportDataClient, FakeReportDataClient>();
                services.AddSingleton<IAppSettingsClient, FakeAppSettingsClient>();
            });
        });
    }

    [Fact]
    public async Task Health_returns_ok()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Swagger_json_available_in_development()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("FileService API", json);
        Assert.Contains("/v1/reports/{reportId}/pdf", json);
    }

    [Fact]
    public async Task Report_pdf_returns_pdf_bytes()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/pdf?disposition=inline");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length > 4);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
    }

    [Fact]
    public async Task Premium_profile_with_branding_returns_pdf()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/pdf?profile=premium&branding=true&disposition=inline");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task By_domain_pdf_resolves_report()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/by-domain/example.com/pdf");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Report_workbook_returns_xlsx_bytes()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/workbook");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            response.Content.Headers.ContentType?.MediaType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length > 4);
        Assert.Equal("PK", System.Text.Encoding.ASCII.GetString(bytes, 0, 2));
    }

    [Fact]
    public async Task By_domain_workbook_resolves_report()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/by-domain/example.com/workbook");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Report_csv_returns_csv()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/csv?disposition=inline");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("# Site Audit export", body);
        Assert.Contains("example.com", body);
    }

    [Fact]
    public async Task Report_json_returns_payload()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("example.com", doc.RootElement.GetProperty("site_name").GetString());
    }

    [Fact]
    public async Task Report_sitemap_returns_xml()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/1/sitemap");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/xml", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("<urlset", body);
        Assert.Contains("https://example.com/", body);
    }

    [Fact]
    public async Task By_domain_csv_resolves_report()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/by-domain/example.com/csv");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task By_domain_json_resolves_report()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/by-domain/example.com/json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task By_domain_sitemap_resolves_report()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/v1/reports/by-domain/example.com/sitemap");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private sealed class FakeReportDataClient : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default)
        {
            IReadOnlyList<ReportListRow> rows =
            [
                new ReportListRow { Id = 1, CanonicalDomain = "example.com", SiteName = "example.com" },
            ];
            return Task.FromResult(rows);
        }

        public async Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default)
        {
            var json = await File.ReadAllTextAsync(Path.Combine("fixtures", "full-payload.json"), cancellationToken);
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
    }

    private sealed class FakeAppSettingsClient : IAppSettingsClient
    {
        public Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default)
        {
            if (!enabled)
            {
                return Task.FromResult(new PdfBrandingModel { Enabled = false });
            }
            return Task.FromResult(new PdfBrandingModel
            {
                Enabled = true,
                AgencyName = "Test Agency",
                AgencySubtitle = "Audits",
            });
        }
    }
}
