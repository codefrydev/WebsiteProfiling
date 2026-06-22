using System.Net;
using System.Text.Json;
using FileService.Application.Options;
using FileService.Domain.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FileService.Application.Clients;

public sealed class ReportDataClient : IReportDataClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private readonly ILogger<ReportDataClient> _logger;

    public ReportDataClient(HttpClient http, IOptions<FastApiOptions> options, ILogger<ReportDataClient> logger)
    {
        _http = http;
        _logger = logger;
        var baseUrl = options.Value.BaseUrl.TrimEnd('/');
        _http.BaseAddress = new Uri(baseUrl + "/");
        _http.Timeout = TimeSpan.FromSeconds(Math.Max(5, options.Value.TimeoutSeconds));
    }

    public async Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("api/report/meta", cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("reports", out var reportsEl) || reportsEl.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var rows = new List<ReportListRow>();
        foreach (var item in reportsEl.EnumerateArray())
        {
            rows.Add(new ReportListRow
            {
                Id = item.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0,
                CanonicalDomain = GetString(item, "canonical_domain"),
                SiteName = GetString(item, "site_name"),
                GeneratedAt = GetString(item, "generated_at"),
            });
        }
        return rows;
    }

    public async Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync($"api/report/payload?reportId={reportId}", cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        await EnsureSuccessAsync(response, cancellationToken);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("payload", out var payload))
        {
            return null;
        }
        return payload.Clone();
    }

    private static string? GetString(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        return prop.GetString();
    }

    private async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        _logger.LogWarning("FastAPI request failed: {Status} {Body}", response.StatusCode, body);
        throw new HttpRequestException($"FastAPI returned {(int)response.StatusCode}: {body}", null, response.StatusCode);
    }
}
