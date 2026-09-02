using System.Text.Json;
using CoreService.Api.DataApplication.Clients;
using CoreService.Api.DataApplication.Services;
using CoreService.Api.Domain.Data.Models;
using CoreService.Api.Rendering;
using Microsoft.Extensions.Logging.Abstractions;

namespace CoreService.Tests;

public class ReportServiceTests
{
    [Fact]
    public async Task PdfReportService_throws_when_payload_missing()
    {
        var service = new PdfReportService(
            new NullPayloadClient(),
            new StubBrandingClient(),
            new AuditPdfGenerator(),
            NullLogger<PdfReportService>.Instance);

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            service.GenerateByReportIdAsync(99, PdfProfile.Standard, branding: false));
    }

    [Fact]
    public async Task PdfReportService_throws_when_domain_unresolved()
    {
        var service = new PdfReportService(
            new EmptyReportsClient(),
            new StubBrandingClient(),
            new AuditPdfGenerator(),
            NullLogger<PdfReportService>.Instance);

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            service.GenerateByDomainAsync("missing.test", PdfProfile.Standard, branding: false));
    }

    [Fact]
    public async Task WorkbookReportService_throws_when_payload_missing()
    {
        var service = new WorkbookReportService(
            new NullPayloadClient(),
            new AuditWorkbookGenerator(),
            NullLogger<WorkbookReportService>.Instance);

        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GenerateByReportIdAsync(99));
    }

    [Fact]
    public async Task WorkbookReportService_generates_bytes_when_payload_exists()
    {
        using var doc = JsonDocument.Parse("""{"links":[{"url":"https://ex.com","status":"200"}]}""");
        var service = new WorkbookReportService(
            new FixedPayloadClient(doc.RootElement.Clone()),
            new AuditWorkbookGenerator(),
            NullLogger<WorkbookReportService>.Instance);

        var bytes = await service.GenerateByReportIdAsync(1);

        Assert.StartsWith("PK", System.Text.Encoding.ASCII.GetString(bytes, 0, 2));
    }

    private sealed class NullPayloadClient : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ReportListRow>>([]);

        public Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default) =>
            Task.FromResult<JsonElement?>(null);
    }

    private sealed class EmptyReportsClient : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ReportListRow>>([]);

        public Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class FixedPayloadClient(JsonElement payload) : IReportDataClient
    {
        public Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ReportListRow>>([]);

        public Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default) =>
            Task.FromResult<JsonElement?>(payload);
    }

    private sealed class StubBrandingClient : IAppSettingsClient
    {
        public Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PdfBrandingModel { Enabled = enabled });
    }
}
