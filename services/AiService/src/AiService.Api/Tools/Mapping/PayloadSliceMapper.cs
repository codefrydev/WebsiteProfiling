using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Google;
using WebsiteProfiling.Contracts.Json;
using WebsiteProfiling.Contracts.Report;

namespace AiService.Api.Tools.Mapping;

public static class PayloadSliceMapper
{
    public static GoogleSlice? ToGoogleSlice(JsonObject? raw)
    {
        if (raw is null)
        {
            return null;
        }

        var (gscJson, ga4Json) = GscGa4JsonBlobs(raw);
        return new GoogleSlice
        {
            Gsc = MapGscBlob(gscJson),
            Ga4 = MapGa4Blob(ga4Json),
            FetchedAt = JsonCoercion.AsString(raw["fetched_at"]),
        };
    }

    public static ReportMetaSlice? ToReportMetaSlice(JsonObject? payload)
    {
        if (payload is null)
        {
            return null;
        }

        var meta = payload["report_meta"] as JsonObject;
        var sources = new List<string>();
        if (meta?["data_sources"] is JsonArray arr)
        {
            foreach (var item in arr)
            {
                if (JsonCoercion.AsString(item) is { Length: > 0 } s)
                {
                    sources.Add(s);
                }
            }
        }

        return new ReportMetaSlice
        {
            CrawlRunId = JsonCoercion.AsInt(payload["crawl_run_id"]),
            GeneratedAt = JsonCoercion.AsString(meta?["generated_at"]),
            ReportGeneratedAt = JsonCoercion.AsString(payload["report_generated_at"]),
            SiteName = JsonCoercion.AsString(payload["site_name"]),
            DataSources = sources,
        };
    }

    public static IssuesBucketSlice? ToIssuesBucketSlice(JsonObject? payload)
    {
        if (payload?["issues"] is not JsonObject issues)
        {
            return null;
        }

        return new IssuesBucketSlice
        {
            Critical = ParseIssueList(issues["critical"]),
            High = ParseIssueList(issues["high"]),
            Medium = ParseIssueList(issues["medium"]),
            Low = ParseIssueList(issues["low"]),
        };
    }

    private static IReadOnlyList<IssueRecord> ParseIssueList(JsonNode? node)
    {
        if (node is not JsonArray arr)
        {
            return [];
        }

        var list = new List<IssueRecord>();
        foreach (var item in arr)
        {
            if (item is not JsonObject obj)
            {
                continue;
            }

            try
            {
                var record = JsonSerializer.Deserialize<IssueRecord>(obj.ToJsonString(), ContractJsonOptions.Options);
                if (record is not null)
                {
                    list.Add(record);
                }
            }
            catch (JsonException)
            {
                // skip malformed issue rows
            }
        }

        return list;
    }

    private static (JsonObject Gsc, JsonObject Ga4) GscGa4JsonBlobs(JsonObject raw)
    {
        var gsc = raw["gsc_full"] as JsonObject ?? raw["gsc"] as JsonObject ?? [];
        var ga4 = raw["ga4_full"] as JsonObject ?? raw["ga4"] as JsonObject ?? [];
        return (gsc, ga4);
    }

    private static GoogleSlice.GscBlob? MapGscBlob(JsonObject gsc)
    {
        if (gsc.Count == 0)
        {
            return null;
        }

        GscSummary? summary = null;
        if (gsc["summary"] is JsonObject summaryObj)
        {
            summary = JsonSerializer.Deserialize<GscSummary>(summaryObj.ToJsonString(), ContractJsonOptions.Options);
        }

        var byPage = new Dictionary<string, GscPageRecord>(StringComparer.Ordinal);
        if (gsc["by_page"] is JsonObject bp)
        {
            foreach (var (key, val) in bp)
            {
                if (val is JsonObject pageObj)
                {
                    var record = JsonSerializer.Deserialize<GscPageRecord>(pageObj.ToJsonString(), ContractJsonOptions.Options);
                    if (record is not null)
                    {
                        byPage[key] = record with { Page = string.IsNullOrEmpty(record.Page) ? key : record.Page };
                    }
                }
            }
        }

        return new GoogleSlice.GscBlob { Summary = summary, ByPage = byPage };
    }

    private static GoogleSlice.Ga4Blob? MapGa4Blob(JsonObject ga4)
    {
        if (ga4.Count == 0)
        {
            return null;
        }

        Ga4Summary? summary = null;
        if (ga4["summary"] is JsonObject summaryObj)
        {
            summary = JsonSerializer.Deserialize<Ga4Summary>(summaryObj.ToJsonString(), ContractJsonOptions.Options);
        }

        var byPath = new Dictionary<string, Ga4PageRecord>(StringComparer.Ordinal);
        if (ga4["by_path"] is JsonObject bp)
        {
            foreach (var (key, val) in bp)
            {
                if (val is JsonObject pageObj)
                {
                    var record = JsonSerializer.Deserialize<Ga4PageRecord>(pageObj.ToJsonString(), ContractJsonOptions.Options);
                    if (record is not null)
                    {
                        byPath[key] = record with { Path = string.IsNullOrEmpty(record.Path) ? key : record.Path };
                    }
                }
            }
        }

        return new GoogleSlice.Ga4Blob { Summary = summary, ByPath = byPath };
    }
}
