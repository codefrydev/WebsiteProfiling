using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ReportService.Application.Bridge;
using ReportService.Application.Options;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

public sealed class ReportBuildService(
    FastApiPythonBridge bridge,
    NativeReportBuilder nativeBuilder,
    CrawlRepository crawlRepository,
    CategoryBuilder categoryBuilder,
    IOptions<ReportServiceOptions> options,
    IHttpClientFactory httpClientFactory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task<ReportBuildBridgeResult> BuildAsync(
        long propertyId,
        long? crawlRunId,
        IReadOnlyDictionary<string, string>? config,
        bool runKeywordEnrich,
        CancellationToken cancellationToken = default)
    {
        var useBridge = options.Value.UsePythonBridge || FastApiPythonBridge.ShouldUseBridge();
        var result = useBridge
            ? await bridge.BuildReportAsync(propertyId, crawlRunId, config, cancellationToken)
            : await nativeBuilder.BuildAsync(propertyId, crawlRunId, config, cancellationToken);

        if (result.Ok && runKeywordEnrich)
        {
            await TryKeywordEnrichAsync(propertyId, cancellationToken);
        }

        if (result.Ok && useBridge && ShouldValidateNative())
        {
            result = await AppendNativeValidationWarningsAsync(result, crawlRunId, cancellationToken);
        }

        return result;
    }

    private static bool ShouldValidateNative()
    {
        var flag = Environment.GetEnvironmentVariable("REPORT_SERVICE_VALIDATE_NATIVE");
        return string.Equals(flag, "1", StringComparison.Ordinal)
               || string.Equals(flag, "true", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<ReportBuildBridgeResult> AppendNativeValidationWarningsAsync(
        ReportBuildBridgeResult result,
        long? crawlRunId,
        CancellationToken cancellationToken)
    {
        try
        {
            var rows = await crawlRepository.ReadCrawlAsync(crawlRunId, cancellationToken);
            using var doc = JsonDocument.Parse(result.RawBody);
            var root = doc.RootElement;
            if (!TryGetBridgePayload(root, out var payload))
            {
                return result;
            }

            var warnings = ReportNativeValidator.ValidateUrlCounts(payload, rows.Count);
            var nativeSeo = SeoSummaryBuilder.Compute(rows);
            warnings.AddRange(ReportNativeValidator.ValidateSeoSummary(nativeSeo.Summary, payload));

            var edges = CategoryBuilder.BuildEdges(rows);
            var summarySeo = new Dictionary<string, object?>
            {
                ["issues"] = new Dictionary<string, object?>
                {
                    ["broken"] = nativeSeo.Issues.GetValueOrDefault("broken") ?? [],
                    ["redirects"] = nativeSeo.Issues.GetValueOrDefault("redirects") ?? [],
                },
            };
            var startUrl = "";
            if (payload.TryGetProperty("report_meta", out var meta)
                && meta.ValueKind == JsonValueKind.Object
                && meta.TryGetProperty("start_url", out var startEl)
                && startEl.ValueKind == JsonValueKind.String)
            {
                startUrl = startEl.GetString() ?? "";
            }

            var mlBundle = MlBundleExtractor.FromBridgePayload(payload);
            var nativeCategories = categoryBuilder.BuildCategories(
                rows,
                edges,
                summarySeo,
                new Dictionary<string, object?>(),
                startUrl,
                mlBundle: mlBundle);
            warnings.AddRange(ReportNativeValidator.ValidateCategories(nativeCategories, payload));
            warnings.AddRange(ReportNativeValidator.ValidateCategoryIssueCounts(nativeCategories, payload));

            var inDegree = LinksListBuilder.BuildInDegree(edges);
            var nativeLinks = LinksListBuilder.BuildLinksList(rows, inDegree, null, mlBundle);
            warnings.AddRange(ReportNativeValidator.ValidateLinksCount(nativeLinks.Count, rows.Count, payload));

            var nativeAnalytics = ContentAnalyticsBuilder.BuildContentAnalytics(rows);
            warnings.AddRange(ReportNativeValidator.ValidateContentAnalyticsThinPages(nativeAnalytics, payload));
            if (warnings.Count == 0)
            {
                return result;
            }

            var logSuffix = string.Join(Environment.NewLine, warnings.Select(w => $"  WARNING: {w}"));
            return result with { Log = result.Log + Environment.NewLine + logSuffix };
        }
        catch (JsonException)
        {
            return result;
        }
        catch (Exception ex)
        {
            return result with
            {
                Log = result.Log + Environment.NewLine + $"  WARNING: native validation skipped: {ex.Message}",
            };
        }
    }

    private static bool TryGetBridgePayload(JsonElement root, out JsonElement payload)
    {
        if (root.TryGetProperty("payload", out var nested) && nested.ValueKind == JsonValueKind.Object)
        {
            payload = nested;
            return true;
        }

        if (root.TryGetProperty("links", out _))
        {
            payload = root;
            return true;
        }

        payload = default;
        return false;
    }

    private async Task TryKeywordEnrichAsync(long propertyId, CancellationToken cancellationToken)
    {
        var baseUrl = (Environment.GetEnvironmentVariable("INTEGRATIONS_SERVICE_URL")
            ?? options.Value.IntegrationsServiceUrl).Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
        {
            return;
        }

        var client = httpClientFactory.CreateClient(nameof(ReportBuildService));
        client.Timeout = TimeSpan.FromSeconds(120);
        try
        {
            using var response = await client.PostAsJsonAsync(
                $"{baseUrl}/internal/integrations/keywords/enrich",
                new { propertyId },
                JsonOptions,
                cancellationToken);
            _ = await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (HttpRequestException)
        {
            // Keyword enrich is optional; report build already succeeded.
        }
    }
}
