using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ReportService.Application.Options;

namespace ReportService.Application.Integrations;

/// <summary>
/// Fetches Google/keyword/GSC link snapshots from IntegrationsService for native report build.
/// </summary>
public sealed class IntegrationsReportDataClient(
    IHttpClientFactory httpClientFactory,
    IOptions<ReportServiceOptions> options)
{
    private const string EnrichmentPath = "/internal/integrations/report/enrichment";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<IntegrationsReportEnrichment?> FetchAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        if (propertyId <= 0)
        {
            return null;
        }

        var baseUrl = options.Value.IntegrationsServiceUrl.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
        {
            return null;
        }

        var client = httpClientFactory.CreateClient(nameof(IntegrationsReportDataClient));
        client.Timeout = TimeSpan.FromSeconds(30);

        try
        {
            using var response = await client.GetAsync(
                $"{baseUrl}{EnrichmentPath}?propertyId={propertyId}",
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = doc.RootElement;

            return new IntegrationsReportEnrichment(
                ParseObject(root, "google"),
                ParseObject(root, "keywords"),
                ParseObject(root, "gscLinks"));
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static Dictionary<string, object?>? ParseObject(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value)
            || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return JsonSerializer.Deserialize<Dictionary<string, object?>>(value.GetRawText(), JsonOptions);
    }
}

public sealed record IntegrationsReportEnrichment(
    Dictionary<string, object?>? Google,
    Dictionary<string, object?>? Keywords,
    Dictionary<string, object?>? GscLinks);
