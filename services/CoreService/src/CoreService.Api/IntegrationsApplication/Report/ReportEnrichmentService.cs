using System.Text.Json;
using System.Text.Json.Nodes;
using CoreService.Api.IntegrationsApplication.Repositories;

namespace CoreService.Api.IntegrationsApplication.Report;

/// <summary>
/// Loads Google/GSC/keyword snapshots from Postgres for report payload assembly.
/// Mirrors Python <c>read_latest_google_data</c>, <c>read_latest_keyword_data</c>,
/// and <c>read_latest_gsc_links_data(for_report=True)</c>.
/// </summary>
public sealed class ReportEnrichmentService(
    GoogleDataReadRepository googleData,
    KeywordDataRepository keywordData,
    GscLinksDataRepository gscLinks)
{
    private const int KeywordReportRowCap = 500;
    private const int GscLinksCombinedCap = 2000;
    private static readonly HashSet<string> GoogleStripKeys = new(StringComparer.Ordinal)
    {
        "gsc_full",
        "ga4_full",
    };

    public async Task<ReportEnrichmentBundle> ReadForReportAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var google = await ReadGooglePayloadAsync(propertyId, cancellationToken);
        var keywords = await ReadKeywordPayloadAsync(propertyId, cancellationToken);
        var gscLinksPayload = await ReadGscLinksPayloadAsync(propertyId, cancellationToken);
        return new ReportEnrichmentBundle(google, keywords, gscLinksPayload);
    }

    private async Task<Dictionary<string, object?>?> ReadGooglePayloadAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        var row = await googleData.ReadSnapshotRowAsync(propertyId, cancellationToken: cancellationToken);
        if (row is null)
        {
            return null;
        }

        using var doc = row.ParseData();
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var node = JsonNode.Parse(doc.RootElement.GetRawText()) as JsonObject;
        if (node is null)
        {
            return null;
        }

        foreach (var key in GoogleStripKeys)
        {
            node.Remove(key);
        }

        return JsonSerializer.Deserialize<Dictionary<string, object?>>(node.ToJsonString());
    }

    private async Task<Dictionary<string, object?>?> ReadKeywordPayloadAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        using var doc = await keywordData.ReadLatestAsync(propertyId, cancellationToken);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var node = JsonNode.Parse(doc.RootElement.GetRawText()) as JsonObject;
        if (node is null)
        {
            return null;
        }

        if (node["rows"] is JsonArray rows && rows.Count > KeywordReportRowCap)
        {
            node["rows"] = new JsonArray(rows.Take(KeywordReportRowCap).Select(r => r?.DeepClone()).ToArray());
        }

        return JsonSerializer.Deserialize<Dictionary<string, object?>>(node.ToJsonString());
    }

    private async Task<Dictionary<string, object?>?> ReadGscLinksPayloadAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        using var doc = await gscLinks.ReadLatestAsync(propertyId, cancellationToken);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(doc.RootElement.GetRawText());
        if (dict is null)
        {
            return null;
        }

        return CapGscLinksForReport(dict);
    }

    internal static Dictionary<string, object?> CapGscLinksForReport(Dictionary<string, object?> data)
    {
        var outDict = new Dictionary<string, object?>(data, StringComparer.Ordinal);
        var sample = ExtractList(outDict, "sample_links");
        var latest = ExtractList(outDict, "latest_links");
        outDict["sample_links_full_count"] = sample.Count;
        outDict["latest_links_full_count"] = latest.Count;

        if (sample.Count > GscLinksCombinedCap)
        {
            outDict["sample_links"] = sample.Take(GscLinksCombinedCap).ToList();
            sample = (List<object?>)outDict["sample_links"]!;
        }

        var sampleCount = sample.Count;
        var latestCap = Math.Max(0, GscLinksCombinedCap - sampleCount);
        if (latest.Count > latestCap)
        {
            outDict["latest_links"] = latest.Take(latestCap).ToList();
        }

        return outDict;
    }

    private static List<object?> ExtractList(Dictionary<string, object?> dict, string key)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
        {
            return [];
        }

        if (val is JsonElement el && el.ValueKind == JsonValueKind.Array)
        {
            return JsonSerializer.Deserialize<List<object?>>(el.GetRawText()) ?? [];
        }

        if (val is List<object?> list)
        {
            return list;
        }

        if (val is IEnumerable<object?> enumerable)
        {
            return enumerable.ToList();
        }

        return [];
    }
}

public sealed record ReportEnrichmentBundle(
    Dictionary<string, object?>? Google,
    Dictionary<string, object?>? Keywords,
    Dictionary<string, object?>? GscLinks);
