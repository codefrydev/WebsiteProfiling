using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Api.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Api.Tools.Context;

/// <summary>
/// Execution context for audit tools (property + report scope). Mirrors Python
/// <c>website_profiling.tools.audit_tools.context.AuditToolContext</c>.
/// </summary>
public sealed class AuditToolContext
{
    public long? PropertyId { get; init; }

    public long? ReportId { get; init; }

    public ILogger? Logger { get; init; }

    public async Task<JsonObject> LoadPayloadAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        string? raw;
        if (ReportId is long reportId)
        {
            raw = await db.ReportPayloads.AsNoTracking()
                .Where(x => x.Id == reportId)
                .Select(x => x.Data)
                .FirstOrDefaultAsync(cancellationToken);
        }
        else if (PropertyId is long propertyId)
        {
            raw = await AuditReportResolver.ResolveLatestPayloadDataAsync(db, propertyId, cancellationToken);
        }
        else
        {
            raw = await db.ReportPayloads.AsNoTracking()
                .OrderByDescending(x => x.Id)
                .Select(x => x.Data)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return ParseJsonObject(raw);
    }

    public async Task<JsonObject?> LoadGoogleAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        var latest = await ReadLatestGoogleAsync(db, offset: 0, cancellationToken);
        if (latest is not null)
        {
            return StripFullBlobs(latest);
        }

        var payload = await LoadPayloadAsync(db, cancellationToken);
        return payload["google"] as JsonObject;
    }

    public async Task<JsonObject?> LoadGoogleFullAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        var latest = await ReadLatestGoogleAsync(db, offset: 0, cancellationToken);
        if (latest is not null)
        {
            return latest;
        }

        var payload = await LoadPayloadAsync(db, cancellationToken);
        return payload["google"] as JsonObject;
    }

    public async Task<(JsonObject? Current, JsonObject? Prior)> LoadGooglePairAsync(
        AuditToolsDbContext db,
        CancellationToken cancellationToken = default)
    {
        var current = await ReadLatestGoogleAsync(db, offset: 0, cancellationToken);
        var prior = await ReadLatestGoogleAsync(db, offset: 1, cancellationToken);
        if (current is null)
        {
            var payload = await LoadPayloadAsync(db, cancellationToken);
            current = payload["google"] as JsonObject;
        }

        return (current, prior);
    }

    public async Task<JsonObject?> LoadKeywordsAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        if (PropertyId is long pid)
        {
            var raw = await db.KeywordData.AsNoTracking()
                .Where(x => x.PropertyId == pid)
                .OrderByDescending(x => x.Id)
                .Select(x => x.Data)
                .FirstOrDefaultAsync(cancellationToken);
            var data = ParseJsonObjectOrNull(raw);
            if (data is not null)
            {
                if (data["rows"] is JsonArray rows && rows.Count > 1000)
                {
                    data["total_rows"] = rows.Count;
                    var capped = new JsonArray();
                    for (var i = 0; i < 1000; i++)
                    {
                        capped.Add(rows[i]?.DeepClone());
                    }

                    data["rows"] = capped;
                    data["truncated"] = true;
                }

                return data;
            }
        }

        var payload = await LoadPayloadAsync(db, cancellationToken);
        return payload["keywords"] as JsonObject;
    }

    /// <summary>Current (capped, via <see cref="LoadKeywordsAsync"/>) + prior (raw, uncapped) keyword_data
    /// snapshots for rank-delta tools. Mirrors Python <c>keyword_lists._load_keyword_pair</c>.</summary>
    public async Task<(JsonObject? Current, JsonObject? Prior)> LoadKeywordSnapshotPairAsync(
        AuditToolsDbContext db,
        CancellationToken cancellationToken = default)
    {
        var current = await LoadKeywordsAsync(db, cancellationToken);
        var prior = await ReadKeywordSnapshotAsync(db, offset: 1, cancellationToken);
        current ??= await ReadKeywordSnapshotAsync(db, offset: 0, cancellationToken);
        return (current, prior);
    }

    private async Task<JsonObject?> ReadKeywordSnapshotAsync(AuditToolsDbContext db, int offset, CancellationToken cancellationToken)
    {
        if (PropertyId is not long pid)
        {
            return null;
        }

        var raw = await db.KeywordData.AsNoTracking()
            .Where(x => x.PropertyId == pid)
            .OrderByDescending(x => x.Id)
            .Skip(Math.Max(0, offset))
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);
        return ParseJsonObjectOrNull(raw);
    }

    /// <summary>Time-series rows for a single keyword from <c>keyword_history</c>. Mirrors Python
    /// <c>integrations.google.keyword_store.read_keyword_history</c>.</summary>
    public async Task<IReadOnlyList<JsonObject>> LoadKeywordHistoryAsync(
        AuditToolsDbContext db,
        string keyword,
        int limit,
        CancellationToken cancellationToken = default)
    {
        if (PropertyId is not long pid)
        {
            return [];
        }

        var rows = await db.KeywordHistory.AsNoTracking()
            .Where(x => x.PropertyId == pid && x.Keyword == keyword)
            .OrderByDescending(x => x.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
        rows.Reverse();
        return rows.Select(r => new JsonObject
        {
            ["fetched_at"] = r.FetchedAt.ToString("O"),
            ["position"] = r.Position,
            ["clicks"] = r.Clicks,
            ["impressions"] = r.Impressions,
            ["ctr"] = r.Ctr,
        }).ToList();
    }

    /// <summary>Current + baseline report payloads for compare/drift tools. Mirrors Python
    /// <c>compare.compare_helpers.load_compare_pair</c>.</summary>
    public async Task<(JsonObject? Current, JsonObject? Baseline, long? CurrentReportId, long? BaselineReportId, string? Error)> LoadComparePairAsync(
        AuditToolsDbContext db,
        JsonObject args,
        CancellationToken cancellationToken = default)
    {
        if (args["baseline_report_id"] is null)
        {
            return (null, null, null, null, "baseline_report_id is required");
        }

        var baselineRaw = WebsiteProfiling.Contracts.Json.JsonCoercion.AsString(args["baseline_report_id"]) ?? args["baseline_report_id"]!.ToString();
        if (!long.TryParse(baselineRaw, out var baselineReportId))
        {
            return (null, null, null, null, "invalid baseline_report_id");
        }

        var currentReportId = ReportId;
        if (currentReportId is null)
        {
            currentReportId = await ResolveLatestReportIdAsync(db, cancellationToken);
            if (currentReportId is null)
            {
                return (null, null, null, null, "no current report found");
            }
        }

        var current = await new AuditToolContext { ReportId = currentReportId }.LoadPayloadAsync(db, cancellationToken);
        var baseline = await new AuditToolContext { ReportId = baselineReportId }.LoadPayloadAsync(db, cancellationToken);
        if (current.Count == 0)
        {
            return (null, null, null, null, $"report {currentReportId} not found");
        }

        if (baseline.Count == 0)
        {
            return (null, null, null, null, $"report {baselineReportId} not found");
        }

        return (current, baseline, currentReportId, baselineReportId, null);
    }

    public async Task<JsonObject?> LoadGscLinksAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        if (PropertyId is long pid)
        {
            var raw = await db.GscLinksData.AsNoTracking()
                .Where(x => x.PropertyId == pid)
                .OrderByDescending(x => x.Id)
                .Select(x => x.Data)
                .FirstOrDefaultAsync(cancellationToken);
            var data = ParseJsonObjectOrNull(raw);
            if (data is not null)
            {
                return data;
            }
        }

        var payload = await LoadPayloadAsync(db, cancellationToken);
        return payload["gsc_links"] as JsonObject;
    }

    public async Task<JsonObject> LoadReportPayloadByIdAsync(
        AuditToolsDbContext db,
        long reportId,
        CancellationToken cancellationToken = default)
    {
        var raw = await db.ReportPayloads.AsNoTracking()
            .Where(x => x.Id == reportId)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);
        return ParseJsonObject(raw);
    }

    public async Task<string> ResolvePropertyDomainAsync(AuditToolsDbContext db, CancellationToken cancellationToken = default)
    {
        if (PropertyId is long pid)
        {
            var domain = await db.Properties.AsNoTracking()
                .Where(x => x.Id == pid)
                .Select(x => x.CanonicalDomain)
                .FirstOrDefaultAsync(cancellationToken);
            var normalized = (domain ?? "").Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(normalized))
            {
                return normalized;
            }
        }

        var payload = await LoadPayloadAsync(db, cancellationToken);
        if (payload["canonical_domain"] is JsonValue cv && cv.TryGetValue<string>(out var canonical))
        {
            var value = (canonical ?? "").Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(value))
            {
                return value;
            }
        }

        if (payload["top_pages"] is JsonArray topPages
            && topPages.Count > 0
            && topPages[0] is JsonObject first
            && first["url"] is JsonValue urlValue
            && urlValue.TryGetValue<string>(out var url)
            && !string.IsNullOrWhiteSpace(url)
            && Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && !string.IsNullOrEmpty(uri.Host))
        {
            return uri.Host.ToLowerInvariant();
        }

        return "";
    }

    public async Task<IReadOnlyList<JsonObject>> LoadCrawlDfAsync(
        AuditToolsDbContext db,
        CancellationToken cancellationToken = default)
    {
        var payload = await LoadPayloadAsync(db, cancellationToken);
        var runId = ResolveCrawlRunId(payload);

        if (runId is null)
        {
            runId = await GetLatestCrawlRunIdAsync(db, cancellationToken);
        }

        var query = db.CrawlResults.AsNoTracking();
        if (runId is long rid)
        {
            query = query.Where(x => x.CrawlRunId == rid);
        }

        var rows = await query.Select(x => new { x.Url, x.FetchMethod, x.Data }).ToListAsync(cancellationToken);
        return rows.Select(r => MergeCrawlRow(r.Url, r.FetchMethod, r.Data, Logger)).ToList();
    }

    public AuditToolContext WithArgs(JsonObject args)
    {
        var propertyId = PropertyId;
        var reportId = ReportId;

        if (args.TryGetPropertyValue("property_id", out var pidNode) && pidNode is not null)
        {
            if (TryParseLong(pidNode, out var parsedPid))
            {
                propertyId = parsedPid;
            }
        }

        if (args.TryGetPropertyValue("report_id", out var ridNode) && ridNode is not null)
        {
            if (TryParseLong(ridNode, out var parsedRid))
            {
                reportId = parsedRid;
            }
        }

        return new AuditToolContext { PropertyId = propertyId, ReportId = reportId };
    }

    private async Task<long?> ResolveLatestReportIdAsync(AuditToolsDbContext db, CancellationToken cancellationToken)
    {
        if (PropertyId is long propertyId)
        {
            return await AuditReportResolver.ResolveLatestReportIdAsync(db, propertyId, cancellationToken);
        }

        return await db.ReportPayloads.AsNoTracking()
            .OrderByDescending(x => x.Id)
            .Select(x => (long?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static bool TryParseLong(JsonNode node, out long value)
    {
        if (node is JsonValue jsonValue)
        {
            if (jsonValue.TryGetValue(out long l))
            {
                value = l;
                return true;
            }

            if (jsonValue.TryGetValue(out int i))
            {
                value = i;
                return true;
            }

            if (jsonValue.TryGetValue(out double d))
            {
                value = (long)d;
                return true;
            }
        }

        return long.TryParse(node.ToString(), out value);
    }

    private static long? ResolveCrawlRunId(JsonObject payload)
    {
        if (payload["crawl_run_id"] is not JsonValue v)
        {
            return null;
        }

        if (v.TryGetValue<long>(out var l))
        {
            return l;
        }

        if (v.TryGetValue<int>(out var i))
        {
            return i;
        }

        if (v.TryGetValue<double>(out var d))
        {
            return (long)d;
        }

        if (v.TryGetValue<string>(out var s) && long.TryParse(s, out var p))
        {
            return p;
        }

        return null;
    }

    private async Task<long?> GetLatestCrawlRunIdAsync(AuditToolsDbContext db, CancellationToken ct)
    {
        if (PropertyId is long propertyId)
        {
            return await db.CrawlRuns.AsNoTracking()
                .Where(x => x.PropertyId == propertyId)
                .OrderByDescending(x => x.Id)
                .Select(x => (long?)x.Id)
                .FirstOrDefaultAsync(ct);
        }

        return await db.CrawlRuns.AsNoTracking()
            .OrderByDescending(x => x.Id)
            .Select(x => (long?)x.Id)
            .FirstOrDefaultAsync(ct);
    }

    private static JsonObject MergeCrawlRow(string url, string fetchMethod, string dataJson, ILogger? logger)
    {
        var row = new JsonObject { ["url"] = url ?? "" };
        var fm = (fetchMethod ?? "").Trim();
        row["fetch_method"] = fm.Length > 0 ? fm : "static";

        if (!string.IsNullOrWhiteSpace(dataJson))
        {
            try
            {
                if (JsonNode.Parse(dataJson) is JsonObject blob)
                {
                    foreach (var (k, v) in blob)
                    {
                        row[k] = v?.DeepClone();
                    }
                }
            }
            catch (JsonException ex)
            {
                logger?.LogDebug(ex, "Malformed JSON in report payload merge");
            }
        }

        return row;
    }

    private async Task<JsonObject?> ReadLatestGoogleAsync(AuditToolsDbContext db, int offset, CancellationToken cancellationToken)
    {
        var query = db.GoogleData.AsNoTracking();
        if (PropertyId is long pid)
        {
            query = query.Where(x => x.PropertyId == pid);
        }

        var raw = await query
            .OrderByDescending(x => x.Id)
            .Skip(Math.Max(0, offset))
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);
        return ParseJsonObjectOrNull(raw);
    }

    private static JsonObject ParseJsonObject(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            return JsonNode.Parse(raw) as JsonObject ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static JsonObject? ParseJsonObjectOrNull(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(raw) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static JsonObject StripFullBlobs(JsonObject data)
    {
        var output = new JsonObject();
        foreach (var (key, value) in data)
        {
            if (key is "gsc_full" or "ga4_full")
            {
                continue;
            }

            output[key] = value?.DeepClone();
        }

        return output;
    }
}
