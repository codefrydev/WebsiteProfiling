using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Crawl;
using WebsiteProfiling.Contracts.Google;
using WebsiteProfiling.Contracts.Json;
using WebsiteProfiling.Contracts.Report;

namespace Data.Application.Mapping;

public static class PayloadSliceMapper
{
    public static ReportMetaSlice? ToReportMetaSlice(JsonElement? payload)
    {
        if (payload is not { ValueKind: JsonValueKind.Object } root)
        {
            return null;
        }

        var sources = new List<string>();
        JsonElement meta = default;
        var hasMeta = root.TryGetProperty("report_meta", out meta) && meta.ValueKind == JsonValueKind.Object;
        if (hasMeta
            && meta.TryGetProperty("data_sources", out var arr)
            && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } s)
                {
                    sources.Add(s);
                }
            }
        }

        return new ReportMetaSlice
        {
            CrawlRunId = JsonCoercion.GetInt(root, "crawl_run_id"),
            GeneratedAt = hasMeta ? JsonCoercion.GetString(meta, "generated_at") : null,
            ReportGeneratedAt = JsonCoercion.GetString(root, "report_generated_at"),
            SiteName = JsonCoercion.GetString(root, "site_name"),
            DataSources = sources,
        };
    }

    public static IssuesBucketSlice? ToIssuesBucketSlice(JsonElement? payload)
    {
        if (payload is not { ValueKind: JsonValueKind.Object } root
            || !root.TryGetProperty("issues", out var issues)
            || issues.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return new IssuesBucketSlice
        {
            Critical = ParseIssueList(issues, "critical"),
            High = ParseIssueList(issues, "high"),
            Medium = ParseIssueList(issues, "medium"),
            Low = ParseIssueList(issues, "low"),
        };
    }

    public static GoogleSlice? ToGoogleSlice(JsonObject? raw)
    {
        if (raw is null)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<GoogleSlice>(raw.ToJsonString(), ContractJsonOptions.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static GoogleSlice? ToGoogleSlice(JsonElement? payload)
    {
        if (payload is not { ValueKind: JsonValueKind.Object })
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<GoogleSlice>(payload.Value.GetRawText(), ContractJsonOptions.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static CrawlPreviewDto ToCrawlPreview(long crawlRunId, IReadOnlyList<CrawlRow> pages)
        => new() { Id = crawlRunId, Pages = pages, Total = pages.Count };

    private static IReadOnlyList<IssueRecord> ParseIssueList(JsonElement issues, string key)
    {
        if (!issues.TryGetProperty(key, out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var list = new List<IssueRecord>();
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            try
            {
                var record = JsonSerializer.Deserialize<IssueRecord>(item.GetRawText(), ContractJsonOptions.Options);
                if (record is not null)
                {
                    list.Add(record);
                }
            }
            catch (JsonException)
            {
                // skip malformed rows
            }
        }

        return list;
    }
}
