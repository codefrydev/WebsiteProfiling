using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Dto.Meta;
using Data.Application.Dto.Portfolio;
using Data.Application.Dto.Report;
using Data.Application.Portfolio;
using Data.Application.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Data.Tests;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IReportRepository>();
                services.RemoveAll<IPortfolioService>();
                services.RemoveAll<IPortfolioRepository>();
                services.AddScoped<IReportRepository, FakeReportRepository>();
                services.AddScoped<IPortfolioService, FakePortfolioService>();
                services.AddScoped<IPortfolioRepository, FakePortfolioRepository>();
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
    public async Task Report_meta_returns_expected_json_shape()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("reports", out var reports));
        Assert.True(root.TryGetProperty("crawlRuns", out _));
        Assert.Equal(JsonValueKind.Array, reports.ValueKind);
        Assert.True(reports.GetArrayLength() > 0);
        var row = reports[0];
        Assert.True(row.TryGetProperty("canonical_domain", out _));
        Assert.False(row.TryGetProperty("canonicalDomain", out _));
    }

    [Fact]
    public async Task Report_payload_full_streams_raw_json()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/payload?reportId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("{\"payload\":{\"site_name\":\"example.com\"}}", body);
    }

    [Fact]
    public async Task Report_payload_invalid_section_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/payload?reportId=1&section=bad");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid section", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Report_payload_not_found_returns_404()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/payload?reportId=999");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Report not found", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Report_history_returns_history_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/history");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("history", out var history));
        Assert.Equal(JsonValueKind.Array, history.ValueKind);
    }

    [Fact]
    public async Task Report_mobile_delta_requires_id()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/mobile-delta");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("id required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Report_portfolio_invalid_widget_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/portfolio?widget=bad");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid widget", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Report_portfolio_groups_returns_expected_keys()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/portfolio?widget=groups");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("groups", out var groups));
        Assert.True(doc.RootElement.TryGetProperty("crawlHistoryByDomain", out _));
        Assert.Equal(JsonValueKind.Array, groups.ValueKind);
    }

    [Fact]
    public async Task Report_portfolio_card_requires_id()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/portfolio?widget=card");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("reportId or crawlRunId required for card widget", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Report_portfolio_card_returns_group()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/report/portfolio?widget=card&reportId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("group", out var group));
        Assert.Equal("example.com", group.GetProperty("domainName").GetString());
    }

    [Fact]
    public async Task Swagger_json_lists_report_routes()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("Website Profiling Data API", json);
        Assert.Contains("/api/report/meta", json);
        Assert.Contains("/api/report/portfolio", json);
        Assert.Contains("/api/portfolio/delete", json);
    }

    [Fact]
    public async Task Portfolio_delete_missing_ids_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/portfolio/delete")
        {
            Content = JsonContent.Create(new { }),
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("reportId or crawlRunId required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Portfolio_delete_not_found_returns_404()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/portfolio/delete")
        {
            Content = JsonContent.Create(new { crawlRunId = 999L }),
        });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("portfolio item not found", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Portfolio_delete_success_returns_ok()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/portfolio/delete")
        {
            Content = JsonContent.Create(new { crawlRunId = 42L }),
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
    }

    private sealed class FakePortfolioRepository : IPortfolioRepository
    {
        public Task<bool> DeletePortfolioItemAsync(long? reportId, long? crawlRunId, CancellationToken cancellationToken)
        {
            if (reportId == 999 || crawlRunId == 999)
                return Task.FromResult(false);
            if (reportId is not null || crawlRunId is not null)
                return Task.FromResult(true);
            return Task.FromResult(false);
        }

        public Task<(int ReportCount, long ReportMaxId, int CrawlCount, long CrawlMaxId)> GetCacheKeyPartsAsync(
            CancellationToken cancellationToken) =>
            Task.FromResult((0, 0L, 0, 0L));

        public Task<IReadOnlyList<PortfolioReportRow>> ListReportsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<PortfolioReportRow>>([]);

        public Task<IReadOnlyList<PortfolioReportRow>> ListReportsLatestPerDomainAsync(
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<PortfolioReportRow>>([]);

        public Task<IReadOnlyList<PortfolioCrawlRunRow>> ListCrawlRunsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<PortfolioCrawlRunRow>>([]);

        public Task<IReadOnlyList<PortfolioCrawlSummaryRow>> ListCrawlRunSummariesAsync(
            int? maxRuns, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<PortfolioCrawlSummaryRow>>([]);

        public Task<IReadOnlyDictionary<long, string>> ReadReportPayloadsPortfolioAsync(
            IReadOnlyList<long> reportIds, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyDictionary<long, string>>(new Dictionary<long, string>());

        public Task<string?> ReadReportPayloadAsync(long reportId, CancellationToken cancellationToken) =>
            Task.FromResult<string?>(null);

        public Task<long?> FindReportIdByCrawlRunIdAsync(long crawlRunId, CancellationToken cancellationToken) =>
            Task.FromResult<long?>(null);
    }

    private sealed class FakePortfolioService : IPortfolioService
    {
        public Task<object> GetPortfolioResponseAsync(
            string widget,
            IReadOnlyList<long> ids,
            long? reportId,
            long? crawlRunId,
            CancellationToken cancellationToken)
        {
            if (widget.Equals("card", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult<object>(new PortfolioCardResponseDto
                {
                    Group = new PortfolioGroupDto
                    {
                        DomainName = "example.com",
                        DomainParam = "example.com",
                        HealthScore = 80,
                        ReportId = reportId ?? 1,
                    },
                });
            }

            if (widget.Equals("summary", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult<object>(new PortfolioSummaryResponseDto
                {
                    TotalBrands = 1,
                    TotalUrls = 10,
                    AvgHealth = 80,
                });
            }

            return Task.FromResult<object>(new PortfolioGroupsResponseDto
            {
                Groups =
                [
                    new PortfolioGroupDto
                    {
                        DomainName = "example.com",
                        DomainParam = "example.com",
                        HealthScore = 80,
                        ReportId = 1,
                    },
                ],
                CrawlHistoryByDomain = new Dictionary<string, IReadOnlyList<PortfolioCrawlHistoryPointDto>>(),
            });
        }
    }

    private sealed class FakeReportRepository : IReportRepository
    {
        public Task<ReportMetaResponse> GetMetaAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new ReportMetaResponse
            {
                Reports =
                [
                    new ReportListItem
                    {
                        Id = 1,
                        CanonicalDomain = "example.com",
                        SiteName = "Example",
                        GeneratedAt = "2024-01-01T00:00:00",
                    },
                ],
                CrawlRuns = [],
            });

        public Task<string?> GetPayloadDataAsync(long? reportId, string? domain, CancellationToken ct) =>
            Task.FromResult<string?>(reportId == 999 ? null : """{"site_name":"example.com"}""");

        public Task<AuditHistoryResponse> ListAuditHistoryAsync(string? domain, int limit, CancellationToken ct) =>
            Task.FromResult(new AuditHistoryResponse
            {
                History =
                [
                    new AuditHistoryItem { ReportId = 1, CanonicalDomain = "example.com" },
                ],
            });

        public Task<JsonObject?> GetCrawlPreviewPayloadAsync(long crawlRunId, CancellationToken ct) =>
            Task.FromResult<JsonObject?>(new JsonObject { ["id"] = crawlRunId });

        public Task<MobileDeltaResponse> GetMobileDeltaAsync(long runId, CancellationToken ct) =>
            Task.FromResult(new MobileDeltaResponse());
    }
}
