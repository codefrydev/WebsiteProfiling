using System.Net.Http.Json;
using System.Text.Json;

namespace ReportService.Application.Integrations;

/// <summary>Port of Python integrations/crux/fetch.py — origin-level CrUX field metrics.</summary>
public static class CruxOriginMetricsFetcher
{
    private const string CruxApi = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

    public static async Task<Dictionary<string, object?>> FetchAsync(
        IHttpClientFactory httpClientFactory,
        string startUrl,
        CancellationToken cancellationToken = default)
    {
        var origin = OriginFromUrl(startUrl);
        if (string.IsNullOrEmpty(origin))
        {
            return new Dictionary<string, object?> { ["ok"] = false, ["error"] = "Invalid origin" };
        }

        var apiKey = Environment.GetEnvironmentVariable("CRUX_API_KEY")?.Trim();
        var requestUrl = string.IsNullOrEmpty(apiKey)
            ? CruxApi
            : $"{CruxApi}?key={Uri.EscapeDataString(apiKey)}";

        try
        {
            var client = httpClientFactory.CreateClient();
            using var response = await client.PostAsJsonAsync(
                requestUrl,
                new { origin },
                cancellationToken);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return ParseRecord(origin, doc.RootElement);
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object?>
            {
                ["ok"] = false,
                ["origin"] = origin,
                ["error"] = ex.Message,
            };
        }
    }

    internal static Dictionary<string, object?> ParseRecord(string origin, JsonElement data)
    {
        var record = data.TryGetProperty("record", out var recordEl) ? recordEl : default;
        var metricsEl = record.ValueKind == JsonValueKind.Object
            && record.TryGetProperty("metrics", out var m)
            ? m
            : default;

        var metrics = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (metricsEl.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in metricsEl.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                object? p75 = null;
                if (prop.Value.TryGetProperty("percentiles", out var pct)
                    && pct.ValueKind == JsonValueKind.Object
                    && pct.TryGetProperty("p75", out var p75El))
                {
                    p75 = p75El.ValueKind switch
                    {
                        JsonValueKind.Number => p75El.TryGetInt64(out var n) ? n : p75El.GetDouble(),
                        JsonValueKind.String => p75El.GetString(),
                        _ => null,
                    };
                }

                metrics[prop.Name] = new Dictionary<string, object?> { ["p75"] = p75 };
            }
        }

        double? LcpP75() => MetricP75(metrics, "largest_contentful_paint");
        double? InpP75() => MetricP75(metrics, "interaction_to_next_paint");
        double? ClsP75() => MetricP75(metrics, "cumulative_layout_shift");

        return new Dictionary<string, object?>
        {
            ["origin"] = origin,
            ["ok"] = true,
            ["metrics"] = metrics,
            ["pass"] = new Dictionary<string, object?>
            {
                ["lcp"] = PassThreshold(LcpP75(), 2500),
                ["inp"] = PassThreshold(InpP75(), 200),
                ["cls"] = PassThreshold(ClsP75(), 0.1),
            },
        };
    }

    private static double? MetricP75(IReadOnlyDictionary<string, object?> metrics, string name)
    {
        if (!metrics.TryGetValue(name, out var metricObj)
            || metricObj is not Dictionary<string, object?> metric
            || !metric.TryGetValue("p75", out var p75Obj)
            || p75Obj is null)
        {
            return null;
        }

        return p75Obj switch
        {
            double d => d,
            float f => f,
            long l => l,
            int i => i,
            string s when double.TryParse(s, out var parsed) => parsed,
            _ => null,
        };
    }

    private static bool PassThreshold(double? value, double limit)
    {
        if (value is null)
        {
            return false;
        }

        return value.Value <= limit;
    }

    private static string OriginFromUrl(string url)
    {
        var trimmed = url.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "";
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            return "";
        }

        return $"{uri.Scheme}://{uri.Authority}";
    }
}
