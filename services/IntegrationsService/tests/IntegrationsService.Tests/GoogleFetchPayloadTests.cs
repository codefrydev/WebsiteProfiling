using System.Text.Json;
using IntegrationsService.Application.Google;

namespace IntegrationsService.Tests;

public sealed class GoogleFetchPayloadTests
{
    [Fact]
    public void SerializePayload_has_golden_top_level_keys()
    {
        var service = new GoogleFetchService(null!, null!, null!, null!, null!);
        var payload = new GoogleFetchPayload
        {
            FetchedAt = DateTimeOffset.Parse("2026-01-15T12:00:00+00:00"),
            DateRange = new DateRangePayload { Start = "2026-01-01", End = "2026-01-28" },
            Gsc = new { site_url = "https://example.com/" },
            GscFull = new { by_page = new { } },
            Ga4 = new { property_id = "123" },
            Ga4Full = new { by_path = new { } },
            UrlJoin = new UrlJoinResult { Matched = 3 },
            Errors = ["GA4: no property ID configured"],
        };

        var json = service.SerializePayload(payload);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("fetched_at", out _));
        Assert.True(root.TryGetProperty("date_range", out var dateRange));
        Assert.True(dateRange.TryGetProperty("start", out _));
        Assert.True(dateRange.TryGetProperty("end", out _));
        Assert.True(root.TryGetProperty("gsc", out _));
        Assert.True(root.TryGetProperty("gsc_full", out _));
        Assert.True(root.TryGetProperty("ga4", out _));
        Assert.True(root.TryGetProperty("ga4_full", out _));
        Assert.True(root.TryGetProperty("url_join", out var urlJoin));
        Assert.Equal(3, urlJoin.GetProperty("matched").GetInt32());
        Assert.True(root.TryGetProperty("errors", out var errors));
        Assert.Equal(JsonValueKind.Array, errors.ValueKind);
    }
}
