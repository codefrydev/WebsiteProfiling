using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ReportService.Application.Options;

namespace ReportService.Application.Integrations;

/// <summary>Calls AiService enrichment endpoints for native report build.</summary>
public sealed class AiServiceEnrichmentClient(
    IHttpClientFactory httpClientFactory,
    IOptions<ReportServiceOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<List<Dictionary<string, object?>>> TryClusterKeywordsAsync(
        IReadOnlyList<string> keywords,
        CancellationToken cancellationToken = default)
    {
        if (keywords.Count < 2)
        {
            return [];
        }

        var baseUrl = (Environment.GetEnvironmentVariable("AISERVICE_URL")
            ?? Environment.GetEnvironmentVariable("AI_SERVICE_URL")
            ?? options.Value.AiServiceUrl).Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
        {
            return [];
        }

        var client = httpClientFactory.CreateClient(nameof(AiServiceEnrichmentClient));
        client.Timeout = TimeSpan.FromSeconds(60);

        try
        {
            using var response = await client.PostAsJsonAsync(
                $"{baseUrl}/internal/enrichment/cluster-keywords",
                new { keywords = keywords.Take(200).ToList() },
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return [];
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!doc.RootElement.TryGetProperty("clusters", out var clustersEl)
                || clustersEl.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var clusters = new List<Dictionary<string, object?>>();
            foreach (var node in clustersEl.EnumerateArray())
            {
                if (node.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                    node.GetRawText(),
                    JsonOptions);
                if (dict is not null)
                {
                    clusters.Add(dict);
                }
            }

            return clusters;
        }
        catch (HttpRequestException)
        {
            return [];
        }
        catch (TaskCanceledException)
        {
            return [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
