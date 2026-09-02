using System.Net;
using System.Text.Json;
using CoreService.Api.DataApplication.Clients;
using CoreService.Api.Domain.Data.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CoreService.Tests;

public class ApiErrorPathTests
{
    [Fact]
    public async Task Pdf_returns_404_when_report_missing()
    {
        await using var factory = CreateFactory(new MissingPayloadClient());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/reports/999/pdf");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Workbook_returns_404_when_report_missing()
    {
        await using var factory = CreateFactory(new MissingPayloadClient());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/reports/999/workbook");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Pdf_returns_502_when_upstream_fails()
    {
        await using var factory = CreateFactory(new FailingPayloadClient());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/reports/1/pdf");

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task By_domain_pdf_returns_404_when_domain_unknown()
    {
        await using var factory = CreateFactory(new MissingPayloadClient());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/reports/by-domain/unknown.test/pdf");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static WebApplicationFactory<Api.Program> CreateFactory(IReportDataClient reportClient) =>
        new WebApplicationFactory<Api.Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IReportDataClient>();
                services.RemoveAll<IAppSettingsClient>();
                services.AddSingleton(reportClient);
                services.AddSingleton<IAppSettingsClient, StubBrandingClient>();
            });
        });

    private sealed class MissingPayloadClient : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ReportListRow>>([]);

        public Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default) =>
            Task.FromResult<JsonElement?>(null);
    }

    private sealed class FailingPayloadClient : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default) =>
            throw new HttpRequestException("Report API returned 502: unavailable", null, HttpStatusCode.BadGateway);
    }

    private sealed class StubBrandingClient : IAppSettingsClient
    {
        public Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PdfBrandingModel { Enabled = false });
    }
}
