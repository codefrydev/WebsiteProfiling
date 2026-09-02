using System.Text.Json;
using CoreService.Api.Application.Bridge;
using CoreService.Api.Application.Options;
using CoreService.Api.Application.Repositories;
using Microsoft.Extensions.Options;

namespace CoreService.Api.Application.Build;

public sealed class ReportBuildService(
    FastApiPythonBridge bridge,
    NativeReportBuilder nativeBuilder,
    CrawlRepository crawlRepository,
    CategoryBuilder categoryBuilder,
    IOptions<ReportServiceOptions> options,
    IHttpClientFactory httpClientFactory,
    ILogger<ReportBuildService> logger)
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
        var useBridge = options.Value.UsePythonBridge;
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
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var snippet = body.Length > 200 ? body[..200] + "…" : body;
                logger.LogWarning(
                    "Keyword enrich returned {StatusCode} for property {PropertyId}: {Body}",
                    (int)response.StatusCode,
                    propertyId,
                    snippet);
                return;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException ex)
        {
            logger.LogWarning(ex, "Keyword enrich timed out for property {PropertyId}", propertyId);
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "Keyword enrich request failed for property {PropertyId}", propertyId);
        }
    }
}
