using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Dto.Meta;
using Data.Application.Dto.Report;
using Data.Application.Json;
using Data.Application.Persistence;
using Data.Application.Report;
using Data.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WebsiteProfiling.Contracts.Report;

namespace Data.Application.Repositories;

public sealed class ReportRepository(DataDbContext db, ILogger<ReportRepository> logger) : IReportRepository
{
    // ── /api/report/meta ────────────────────────────────────────────────────

    public async Task<ReportMetaResponse> GetMetaAsync(CancellationToken cancellationToken)
    {
        return new ReportMetaResponse
        {
            Reports = await ListReportsAsync(cancellationToken),
            CrawlRuns = await ListCrawlRunsAsync(cancellationToken),
        };
    }

    private async Task<List<ReportListItem>> ListReportsAsync(CancellationToken ct)
    {
        var rows = await db.ReportPayloads
            .OrderByDescending(r => r.Id)
            .Select(r => new { r.Id, r.CanonicalDomain, r.SiteName, r.GeneratedAt })
            .ToListAsync(ct);

        return rows.Select(r => new ReportListItem
        {
            Id = r.Id,
            CanonicalDomain = r.CanonicalDomain,
            SiteName = r.SiteName,
            GeneratedAt = PyIso.Format(r.GeneratedAt),
        }).ToList();
    }

    private async Task<List<CrawlRunItem>> ListCrawlRunsAsync(CancellationToken ct)
    {
        try
        {
            var rows = await db.CrawlRuns
                .OrderByDescending(c => c.Id)
                .Select(c => new { c.Id, c.StartUrl, c.CreatedAt, c.RenderMode, c.DiscoveryMode })
                .ToListAsync(ct);

            return rows.Select(c => new CrawlRunItem
            {
                Id = c.Id,
                StartUrl = c.StartUrl ?? "",
                CreatedAt = PyIso.Format(c.CreatedAt),
                RenderMode = c.RenderMode,
                DiscoveryMode = c.DiscoveryMode,
            }).ToList();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "list_crawl_runs query failed; returning empty list");
            return [];
        }
    }

    // ── /api/report/payload ──────────────────────────────────────────────────

    public async Task<string?> GetPayloadDataAsync(long? reportId, string? domain, CancellationToken ct)
    {
        var ctx = await GetPayloadContextAsync(reportId, domain, ct);
        return ctx?.DataJson;
    }

    public async Task<ReportPayloadContext?> GetPayloadContextAsync(
        long? reportId,
        string? domain,
        CancellationToken ct)
    {
        var row = await ResolveReportRowAsync(reportId, domain, ct);
        if (row is null)
        {
            return null;
        }

        return new ReportPayloadContext(row.Data, row.CanonicalDomain);
    }

    private async Task<ReportPayload?> ResolveReportRowAsync(
        long? reportId,
        string? domain,
        CancellationToken ct)
    {
        long? resolvedId = reportId;

        if (resolvedId is null && !string.IsNullOrWhiteSpace(domain))
        {
            var domainLower = domain.Trim().ToLowerInvariant();
            resolvedId = await db.ReportPayloads
                .Where(r => r.CanonicalDomain != null &&
                            r.CanonicalDomain.ToLower() == domainLower)
                .OrderByDescending(r => r.Id)
                .Select(r => (long?)r.Id)
                .FirstOrDefaultAsync(ct);
        }

        if (resolvedId is not null)
        {
            return await db.ReportPayloads
                .Where(r => r.Id == resolvedId.Value)
                .FirstOrDefaultAsync(ct);
        }

        return await db.ReportPayloads
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);
    }

    // ── /api/report/payload (legacy inline) ─────────────────────────────────

    public async Task<AuditHistoryResponse> ListAuditHistoryAsync(
        string? domain, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, 100);
        List<(long Id, string? CanonicalDomain, string? SiteName, DateTimeOffset GeneratedAt, string Data)> rows;

        if (!string.IsNullOrWhiteSpace(domain))
        {
            var normalized = domain.Trim().ToLowerInvariant();
            // Mirror the Python regexp_replace domain match; EF FromSql safely parameterises values.
            var entities = await db.ReportPayloads
                .FromSql($"""
                    SELECT id, canonical_domain, site_name, generated_at, data
                    FROM report_payload
                    WHERE LOWER(canonical_domain) = {normalized}
                       OR regexp_replace(LOWER(COALESCE(canonical_domain, '')), '[^a-z0-9]+', '-', 'g') = {normalized}
                    ORDER BY generated_at DESC
                    LIMIT {limit}
                    """)
                .ToListAsync(ct);
            rows = entities.Select(e => (e.Id, e.CanonicalDomain, e.SiteName, e.GeneratedAt, e.Data)).ToList();
        }
        else
        {
            var entities = await db.ReportPayloads
                .OrderByDescending(r => r.GeneratedAt)
                .Take(limit)
                .Select(r => new { r.Id, r.CanonicalDomain, r.SiteName, r.GeneratedAt, r.Data })
                .ToListAsync(ct);
            rows = entities.Select(e => (e.Id, e.CanonicalDomain, e.SiteName, e.GeneratedAt, e.Data)).ToList();
        }

        return new AuditHistoryResponse
        {
            History = rows.Select(MapHistoryItem).ToList(),
        };
    }

    private AuditHistoryItem MapHistoryItem(
        (long Id, string? CanonicalDomain, string? SiteName, DateTimeOffset GeneratedAt, string Data) row)
    {
        JsonElement data = default;
        try
        {
            using var doc = JsonDocument.Parse(row.Data);
            data = doc.RootElement.Clone();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Corrupt report JSON for history item {ReportId}", row.Id);
        }

        var categories = data.ValueKind == JsonValueKind.Object &&
                         data.TryGetProperty("categories", out var cats) &&
                         cats.ValueKind == JsonValueKind.Array
            ? cats
            : default;

        var categoryScores = new Dictionary<string, double>();
        var issueCounts = new Dictionary<string, int>(4)
            { ["Critical"] = 0, ["High"] = 0, ["Medium"] = 0, ["Low"] = 0 };

        if (categories.ValueKind == JsonValueKind.Array)
        {
            foreach (var cat in categories.EnumerateArray())
            {
                // categoryScores: {id or name or "unknown": score}
                var keyElem = cat.TryGetProperty("id", out var id) ? id
                    : cat.TryGetProperty("name", out var nm) ? nm
                    : default;
                var catKey = keyElem.ValueKind == JsonValueKind.String
                    ? keyElem.GetString() ?? "unknown"
                    : "unknown";
                if (cat.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number)
                    categoryScores[catKey] = sc.GetDouble();

                // issueCounts
                if (cat.TryGetProperty("issues", out var issues) && issues.ValueKind == JsonValueKind.Array)
                {
                    foreach (var issue in issues.EnumerateArray())
                    {
                        var priority = issue.TryGetProperty("priority", out var p) &&
                                       p.ValueKind == JsonValueKind.String
                            ? p.GetString() ?? "Medium"
                            : "Medium";
                        issueCounts[priority] = issueCounts.GetValueOrDefault(priority) + 1;
                    }
                }
            }
        }

        return new AuditHistoryItem
        {
            ReportId = row.Id,
            CanonicalDomain = row.CanonicalDomain,
            SiteName = row.SiteName,
            GeneratedAt = PyIso.Format(row.GeneratedAt),
            HealthScore = data.ValueKind == JsonValueKind.Object
                ? SiteHealthScoreBuilder.ResolveFromPayload(data)
                : null,
            CategoryScores = categoryScores,
            IssueCounts = issueCounts,
            PerfScore = LhScore(data, "performance_score", "performance"),
            SeoScore = LhScore(data, "seo_score", "seo"),
            TechnicalSeoScore = TechSeoScore(categories),
        };
    }

    // Mirrors _lh_scores: try median_metrics.{mmKey} first (non-zero), then category_scores.{csKey}.
    private static int? LhScore(JsonElement data, string mmKey, string csKey)
    {
        if (data.ValueKind != JsonValueKind.Object ||
            !data.TryGetProperty("lighthouse_summary", out var summary) ||
            summary.ValueKind != JsonValueKind.Object)
            return null;

        summary.TryGetProperty("median_metrics", out var mm);
        summary.TryGetProperty("category_scores", out var cs);

        var raw = FirstTruthy(mm, mmKey) ?? FirstTruthy(cs, csKey);
        return raw is null ? null : (int)Math.Round(raw.Value, MidpointRounding.ToEven);
    }

    // Returns value if it exists in the object AND is a non-zero number (mirrors Python `or` truthiness).
    private static double? FirstTruthy(JsonElement obj, string key)
    {
        if (obj.ValueKind != JsonValueKind.Object) return null;
        if (!obj.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.Number) return null;
        var d = v.GetDouble();
        return d != 0 ? d : null;
    }

    private static int? TechSeoScore(JsonElement categories)
    {
        if (categories.ValueKind != JsonValueKind.Array) return null;
        foreach (var cat in categories.EnumerateArray())
        {
            if (cat.TryGetProperty("id", out var id) && id.GetString() == "technical_seo")
            {
                if (cat.TryGetProperty("score", out var s) && s.ValueKind == JsonValueKind.Number)
                    return (int)Math.Round(s.GetDouble(), MidpointRounding.ToEven);
                break;
            }
        }
        return null;
    }

    // ── /api/report/crawl-payload ────────────────────────────────────────────

    public async Task<JsonObject?> GetCrawlPreviewPayloadAsync(long crawlRunId, CancellationToken ct)
    {
        var run = await db.CrawlRuns
            .Where(c => c.Id == crawlRunId)
            .Select(c => new { c.Id, c.StartUrl })
            .FirstOrDefaultAsync(ct);

        if (run is null) return null;

        string siteHost = "";
        if (!string.IsNullOrEmpty(run.StartUrl))
        {
            try { siteHost = new Uri(run.StartUrl).Host; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Invalid crawl start URL for run {CrawlRunId}", crawlRunId);
            }
        }

        var results = await db.CrawlResults
            .Where(r => r.CrawlRunId == crawlRunId)
            .Select(r => new { r.Url, r.Data })
            .ToListAsync(ct);

        var pages = new JsonArray();
        foreach (var result in results)
        {
            var pageObj = new JsonObject();
            // Set url first; then spread data on top — mirrors Python {"url": url, **data}.
            pageObj["url"] = result.Url ?? "";
            if (!string.IsNullOrEmpty(result.Data))
            {
                try
                {
                    using var dataDoc = JsonDocument.Parse(result.Data);
                    if (dataDoc.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var prop in dataDoc.RootElement.EnumerateObject())
                            pageObj[prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Corrupt crawl result JSON for run {CrawlRunId} url {Url}", crawlRunId, result.Url);
                }
            }
            pages.Add(pageObj);
        }

        return new JsonObject
        {
            ["crawl_only_preview"] = true,
            ["crawl_run_id"] = crawlRunId,
            ["site_name"] = siteHost,
            ["top_pages"] = pages,
        };
    }

    // ── /api/report/mobile-delta ─────────────────────────────────────────────

    public async Task<MobileDeltaResponse> GetMobileDeltaAsync(long runId, CancellationToken ct)
    {
        var run = await db.CrawlRuns
            .Where(c => c.Id == runId)
            .Select(c => new { c.MobileRunId })
            .FirstOrDefaultAsync(ct);

        if (run?.MobileRunId is null)
            return new MobileDeltaResponse { Deltas = [] };

        var mobileRunId = run.MobileRunId.Value;

        var desktopMap = await FetchRunMapAsync(runId, ct);
        var mobileMap = await FetchRunMapAsync(mobileRunId, ct);

        var deltas = new List<MobileDeltaItem>();
        foreach (var (key, desktop) in desktopMap)
        {
            if (!mobileMap.TryGetValue(key, out var mobile)) continue;

            bool titleDiffers = desktop.Title != mobile.Title;
            bool h1Differs = desktop.H1 != mobile.H1;
            int wcDelta = Math.Abs(desktop.WordCount - mobile.WordCount);
            bool statusDiffers = desktop.Status != mobile.Status;

            if (!titleDiffers && !h1Differs && wcDelta <= 50 && !statusDiffers) continue;

            deltas.Add(new MobileDeltaItem
            {
                Url = key,
                Desktop = desktop,
                Mobile = mobile,
                TitleDiffers = titleDiffers,
                H1Differs = h1Differs,
                WordCountDelta = wcDelta,
                StatusDiffers = statusDiffers,
            });
        }

        // Stable sort descending by (status*4 + title*2 + h1) — mirrors Python's sort(key=..., reverse=True).
        var sorted = deltas
            .OrderByDescending(d =>
                (d.StatusDiffers ? 4 : 0) + (d.TitleDiffers ? 2 : 0) + (d.H1Differs ? 1 : 0))
            .ToList();

        return new MobileDeltaResponse { Deltas = sorted };
    }

    private async Task<Dictionary<string, CrawlPageSnapshot>> FetchRunMapAsync(
        long runId, CancellationToken ct)
    {
        var rows = await db.CrawlResults
            .Where(r => r.CrawlRunId == runId)
            .Select(r => new { r.Url, r.Data })
            .ToListAsync(ct);

        var map = new Dictionary<string, CrawlPageSnapshot>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            // Normalize key the same way Python does: trim + lower.
            var key = (row.Url ?? "").Trim().ToLowerInvariant();

            JsonElement data = default;
            try
            {
                using var doc = JsonDocument.Parse(row.Data);
                data = doc.RootElement.Clone();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Corrupt crawl page JSON for run {RunId} url {Url}", runId, row.Url);
            }

            map[key] = new CrawlPageSnapshot
            {
                Title = StringFromJson(data, "title"),
                H1 = StringFromJson(data, "h1"),
                WordCount = IntFromJson(data, "word_count"),
                Status = IntFromJson(data, "status"),
            };
        }
        return map;
    }

    private static string StringFromJson(JsonElement el, string key)
    {
        if (el.ValueKind != JsonValueKind.Object) return "";
        if (!el.TryGetProperty(key, out var v)) return "";
        return v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    }

    private static int IntFromJson(JsonElement el, string key)
    {
        if (el.ValueKind != JsonValueKind.Object) return 0;
        if (!el.TryGetProperty(key, out var v)) return 0;
        if (v.ValueKind == JsonValueKind.Number) return v.TryGetInt32(out var n) ? n : (int)v.GetDouble();
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var s)) return s;
        return 0;
    }
}
