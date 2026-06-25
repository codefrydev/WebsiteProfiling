using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Dto.Meta;
using Data.Application.Dto.Filters;
using Data.Application.Dto.Issues;
using Data.Application.Dto.Portfolio;
using Data.Application.Dto.Report;
using Data.Application.Portfolio;
using Data.Application.Report;
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
                services.RemoveAll<IReportSectionService>();
                services.RemoveAll<IPortfolioService>();
                services.RemoveAll<IPortfolioRepository>();
                services.RemoveAll<IIssueStatusRepository>();
                services.RemoveAll<ISavedFilterRepository>();
                services.AddScoped<IReportRepository, FakeReportRepository>();
                services.AddScoped<IReportSectionService, ReportSectionService>();
                services.AddScoped<IGoogleDataRepository, FakeGoogleDataRepository>();
                services.AddScoped<IPropertyRepository, FakePropertyRepository>();
                services.AddScoped<IPortfolioService, FakePortfolioService>();
                services.AddScoped<IPortfolioRepository, FakePortfolioRepository>();
                services.AddScoped<IIssueStatusRepository, FakeIssueStatusRepository>();
                services.AddScoped<ISavedFilterRepository, FakeSavedFilterRepository>();
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
        Assert.Contains("/api/issues/status", json);
        Assert.Contains("/api/filters", json);
    }

    [Fact]
    public async Task Filters_list_missing_propertyId_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/filters");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Filters_list_zero_propertyId_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/filters?propertyId=0");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Filters_delete_missing_fields_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/filters")
        {
            Content = JsonContent.Create(new { propertyId = 1L }),
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId and name required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Filters_list_returns_filters_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/filters?propertyId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("filters", out var filters));
        Assert.Equal(JsonValueKind.Array, filters.ValueKind);
        Assert.Equal(1, filters.GetArrayLength());
        Assert.Equal("status-200", filters[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Filters_upsert_success_returns_ok()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/filters", new
        {
            propertyId = 1L,
            name = "my-filter",
            filterJson = new { status = new[] { "200" } },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task Filters_upsert_missing_fields_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/filters", new { propertyId = 1L });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId and name required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Filters_delete_not_found_returns_404()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/filters")
        {
            Content = JsonContent.Create(new { propertyId = 1L, name = "missing" }),
        });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("filter not found", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Filters_delete_success_returns_ok()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/filters")
        {
            Content = JsonContent.Create(new { propertyId = 1L, name = "status-200" }),
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
    }

    private sealed class FakeSavedFilterRepository : ISavedFilterRepository
    {
        public Task<IReadOnlyList<SavedFilterRowDto>> ListAsync(int propertyId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<SavedFilterRowDto>>(
            [
                new SavedFilterRowDto
                {
                    Id = 1,
                    PropertyId = propertyId,
                    Name = "status-200",
                    FilterJson = JsonSerializer.SerializeToElement(new { status = new[] { "200" } }),
                    CreatedAt = "2024-01-01T00:00:00+00:00",
                },
            ]);

        public Task UpsertAsync(
            long propertyId, string name, JsonElement filterJson, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<bool> DeleteAsync(long propertyId, string name, CancellationToken cancellationToken) =>
            Task.FromResult(name != "missing");
    }

    [Fact]
    public async Task Issues_status_list_returns_issues_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/issues/status?propertyId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("issues", out var issues));
        Assert.Equal(JsonValueKind.Array, issues.ValueKind);
        Assert.Equal(1, issues.GetArrayLength());
    }

    [Fact]
    public async Task Issues_status_list_missing_propertyId_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/issues/status");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Issues_status_list_zero_propertyId_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/issues/status?propertyId=0");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("propertyId required", doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Issues_status_upsert_success_returns_issue()
    {
        var client = _factory.CreateClient();
        var response = await client.PutAsJsonAsync("/api/issues/status", new
        {
            propertyId = 1L,
            message = "Missing meta description",
            status = "open",
            url = "https://example.com/page",
            priority = "Medium",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var issue = doc.RootElement.GetProperty("issue");
        Assert.Equal(1, issue.GetProperty("propertyId").GetInt64());
        Assert.Equal("open", issue.GetProperty("status").GetString());
        Assert.Equal("Missing meta description", issue.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Issues_status_upsert_missing_fields_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.PutAsJsonAsync("/api/issues/status", new { propertyId = 1L });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(
            "propertyId, message, and valid status required",
            doc.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Issues_status_upsert_invalid_status_returns_400()
    {
        var client = _factory.CreateClient();
        var response = await client.PutAsJsonAsync("/api/issues/status", new
        {
            propertyId = 1L,
            message = "x",
            status = "bogus",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("invalid status: bogus", doc.RootElement.GetProperty("detail").GetString());
    }

    private sealed class FakeIssueStatusRepository : IIssueStatusRepository
    {
        public Task<IReadOnlyList<IssueStatusRowDto>> ListAsync(int propertyId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<IssueStatusRowDto>>(
            [
                new IssueStatusRowDto
                {
                    Id = 1,
                    PropertyId = propertyId,
                    Message = "Missing meta description",
                    Status = "open",
                    Priority = "Medium",
                    UpdatedAt = "2024-01-01T00:00:00+00:00",
                },
            ]);

        public Task<IssueStatusRowDto> UpsertAsync(
            UpsertIssueStatusRequest request, CancellationToken cancellationToken)
        {
            if (request.Status == "bogus")
                throw new ArgumentException("invalid status: bogus");

            return Task.FromResult(new IssueStatusRowDto
            {
                Id = 1,
                PropertyId = request.PropertyId,
                ReportId = request.ReportId,
                Message = request.Message ?? string.Empty,
                Status = request.Status ?? string.Empty,
                Url = request.Url ?? string.Empty,
                Priority = request.Priority ?? "Medium",
                UpdatedAt = "2024-01-01T00:00:00+00:00",
            });
        }
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

        public Task<ReportPayloadContext?> GetPayloadContextAsync(long? reportId, string? domain, CancellationToken ct) =>
            Task.FromResult<ReportPayloadContext?>(
                reportId == 999 ? null : new ReportPayloadContext("""{"site_name":"example.com"}""", "example.com"));

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

    private sealed class FakeGoogleDataRepository : IGoogleDataRepository
    {
        public Task<JsonObject?> GetLatestPayloadAsync(long? propertyId, CancellationToken cancellationToken = default) =>
            Task.FromResult<JsonObject?>(null);

        public Task<JsonObject?> GetGscDetailAsync(long? propertyId, CancellationToken cancellationToken = default) =>
            Task.FromResult<JsonObject?>(null);
    }

    private sealed class FakePropertyRepository : IPropertyRepository
    {
        public Task<long?> ResolvePropertyIdByDomainAsync(string? domainRaw, CancellationToken cancellationToken = default) =>
            Task.FromResult<long?>(null);
    }
}
