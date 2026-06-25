using System.Text.Json.Nodes;
using Data.Application.Dto.Meta;
using Data.Application.Dto.Report;
using Data.Application.Report;
using Data.Application.Repositories;

namespace Data.Tests;

public sealed class PropertyRepositoryTests
{
    [Theory]
    [InlineData("codefrydev.in", "codefrydev.in")]
    [InlineData("HTTPS://WWW.Example.COM/path", "www.example.com")]
    [InlineData("", "")]
    public void NormalizeDomain_strips_scheme_and_path(string input, string expected)
    {
        Assert.Equal(expected, PropertyRepository.NormalizeDomain(input));
    }
}

public sealed class GoogleDataRepositoryTests
{
    [Fact]
    public void StripKeys_removes_full_blobs_from_json()
    {
        var raw = """
            {"fetched_at":"2026-01-01","gsc":{"summary":{}},"gsc_full":{"big":true},"ga4_full":{"x":1}}
            """;
        var node = System.Text.Json.JsonSerializer.Deserialize<JsonObject>(raw)!;
        node.Remove("gsc_full");
        node.Remove("ga4_full");
        Assert.False(node.ContainsKey("gsc_full"));
        Assert.False(node.ContainsKey("ga4_full"));
        Assert.True(node.ContainsKey("gsc"));
    }
}

public sealed class ReportSectionServiceTests
{
    [Fact]
    public async Task Traffic_section_prefers_google_data_over_embedded_report()
    {
        var reports = new FakeReportRepo(
            """{"google":{"fetched_at":"old","gsc":{"summary":{"clicks":1}}}}""",
            "codefrydev.in");

        var googleRepo = new FakeGoogleRepo(new JsonObject
        {
            ["fetched_at"] = "2026-06-20",
            ["gsc"] = new JsonObject { ["summary"] = new JsonObject { ["clicks"] = 99 } },
        });

        var properties = new FakePropertyRepo(42, "codefrydev.in");

        var svc = new ReportSectionService(reports, googleRepo, properties);
        var slice = await svc.GetSectionPayloadAsync(1, "codefrydev.in", "traffic", CancellationToken.None);

        Assert.NotNull(slice);
        var google = slice!["google"]!.AsObject();
        Assert.Equal("2026-06-20", google["fetched_at"]!.GetValue<string>());
        Assert.Equal(99, google["gsc"]!["summary"]!["clicks"]!.GetValue<int>());
    }

    [Fact]
    public async Task Traffic_section_falls_back_to_report_when_no_google_data()
    {
        var reports = new FakeReportRepo(
            """{"google":{"fetched_at":"embedded-only"}}""",
            "codefrydev.in");
        var googleRepo = new FakeGoogleRepo(null);
        var properties = new FakePropertyRepo(42, "codefrydev.in");

        var svc = new ReportSectionService(reports, googleRepo, properties);
        var slice = await svc.GetSectionPayloadAsync(1, "codefrydev.in", "traffic", CancellationToken.None);

        Assert.NotNull(slice);
        Assert.Equal("embedded-only", slice!["google"]!["fetched_at"]!.GetValue<string>());
    }

    private sealed class FakeReportRepo(string dataJson, string? domain) : IReportRepository
    {
        public Task<ReportMetaResponse> GetMetaAsync(CancellationToken cancellationToken) =>
            throw new NotImplementedException();

        public Task<string?> GetPayloadDataAsync(long? reportId, string? domain, CancellationToken ct) =>
            Task.FromResult<string?>(dataJson);

        public Task<ReportPayloadContext?> GetPayloadContextAsync(long? reportId, string? domain, CancellationToken ct) =>
            Task.FromResult<ReportPayloadContext?>(new ReportPayloadContext(dataJson, domain));

        public Task<AuditHistoryResponse> ListAuditHistoryAsync(string? domain, int limit, CancellationToken ct) =>
            throw new NotImplementedException();

        public Task<JsonObject?> GetCrawlPreviewPayloadAsync(long crawlRunId, CancellationToken ct) =>
            throw new NotImplementedException();

        public Task<MobileDeltaResponse> GetMobileDeltaAsync(long runId, CancellationToken ct) =>
            throw new NotImplementedException();
    }

    private sealed class FakeGoogleRepo(JsonObject? payload) : IGoogleDataRepository
    {
        public Task<JsonObject?> GetLatestPayloadAsync(long? propertyId, CancellationToken cancellationToken = default) =>
            Task.FromResult(payload);
    }

    private sealed class FakePropertyRepo(long id, string domain) : IPropertyRepository
    {
        public Task<long?> ResolvePropertyIdByDomainAsync(string? domainRaw, CancellationToken cancellationToken = default)
        {
            var norm = PropertyRepository.NormalizeDomain(domainRaw);
            if (norm == PropertyRepository.NormalizeDomain(domain))
            {
                return Task.FromResult<long?>(id);
            }

            return Task.FromResult<long?>(null);
        }
    }
}
