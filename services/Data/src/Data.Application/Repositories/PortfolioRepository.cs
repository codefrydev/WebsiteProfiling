using Data.Application.Dto.Portfolio;
using Data.Application.Json;
using Data.Application.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Data.Application.Repositories;

public sealed class PortfolioRepository(
    DataDbContext db,
    NpgsqlDataSource dataSource,
    ILogger<PortfolioRepository> logger) : IPortfolioRepository
{
    private const string PortfolioPayloadSql = """
        SELECT id,
          jsonb_build_object(
            'site_name', data->'site_name',
            'summary', data->'summary',
            'categories', data->'categories',
            'top_pages', COALESCE(data->'top_pages', '[]'::jsonb),
            'report_meta', data->'report_meta',
            'report_generated_at', data->'report_generated_at',
            'crawl_run_id', data->'crawl_run_id',
            'crawl_run_created_at', data->'crawl_run_created_at',
            'lighthouse_summary', jsonb_build_object(
              'median_metrics', data->'lighthouse_summary'->'median_metrics',
              'category_scores', data->'lighthouse_summary'->'category_scores'
            ),
            'seo_health', data->'seo_health',
            'content_analytics', jsonb_build_object(
              'word_count_stats', data->'content_analytics'->'word_count_stats'
            ),
            'response_time_stats', jsonb_build_object(
              'p50', data->'response_time_stats'->'p50'
            ),
            'security_findings', COALESCE(data->'security_findings', '[]'::jsonb),
            'content_duplicates', COALESCE(data->'content_duplicates', '[]'::jsonb)
          ) AS data
        FROM report_payload
        WHERE id = ANY(@ids)
        """;

    public async Task<(int ReportCount, long ReportMaxId, int CrawlCount, long CrawlMaxId)> GetCacheKeyPartsAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var reportCount = await db.ReportPayloads.CountAsync(cancellationToken);
            var reportMaxId = await db.ReportPayloads.MaxAsync(x => (long?)x.Id, cancellationToken) ?? 0L;
            var crawlCount = await db.CrawlRuns.CountAsync(cancellationToken);
            var crawlMaxId = await db.CrawlRuns.MaxAsync(x => (long?)x.Id, cancellationToken) ?? 0L;
            return (reportCount, reportMaxId, crawlCount, crawlMaxId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "portfolio cache key query failed");
            return (0, 0, 0, 0);
        }
    }

    public async Task<IReadOnlyList<PortfolioReportRow>> ListReportsAsync(CancellationToken cancellationToken)
    {
        var rows = await db.ReportPayloads
            .OrderByDescending(r => r.Id)
            .Select(r => new { r.Id, r.CanonicalDomain, r.SiteName, r.GeneratedAt })
            .ToListAsync(cancellationToken);

        return rows.Select(r => MapReportRow(r.Id, r.CanonicalDomain, r.SiteName, r.GeneratedAt)).ToList();
    }

    public async Task<IReadOnlyList<PortfolioReportRow>> ListReportsLatestPerDomainAsync(
        CancellationToken cancellationToken)
    {
        var entities = await db.ReportPayloads
            .FromSql($"""
                SELECT id, canonical_domain, site_name, generated_at, data
                FROM (
                  SELECT DISTINCT ON (COALESCE(NULLIF(canonical_domain, ''), site_name))
                         id, canonical_domain, site_name, generated_at, data
                  FROM report_payload
                  ORDER BY COALESCE(NULLIF(canonical_domain, ''), site_name), generated_at DESC
                ) latest
                """)
            .ToListAsync(cancellationToken);

        return entities.Select(e => MapReportRow(e.Id, e.CanonicalDomain, e.SiteName, e.GeneratedAt)).ToList();
    }

    public async Task<IReadOnlyList<PortfolioCrawlRunRow>> ListCrawlRunsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var rows = await db.CrawlRuns
                .OrderByDescending(c => c.Id)
                .Select(c => new { c.Id, c.StartUrl, c.CreatedAt, c.RenderMode, c.DiscoveryMode })
                .ToListAsync(cancellationToken);

            return rows.Select(c => new PortfolioCrawlRunRow
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
            logger.LogWarning(ex, "list_crawl_runs failed; returning empty list");
            return [];
        }
    }

    public async Task<IReadOnlyList<PortfolioCrawlSummaryRow>> ListCrawlRunSummariesAsync(
        int? maxRuns, CancellationToken cancellationToken)
    {
        try
        {
            var runFilter = "";
            if (maxRuns is > 0)
            {
                runFilter = """
                    WHERE cr.id IN (
                        SELECT id FROM crawl_runs ORDER BY id DESC LIMIT @maxRuns
                    )
                    """;
            }

            var sql = $"""
                SELECT
                   cr.id AS crawl_run_id,
                   cr.start_url,
                   cr.created_at,
                   cr.render_mode,
                   cr.discovery_mode,
                   COUNT(crl.id)::int AS url_count,
                   COUNT(*) FILTER (WHERE crl.status LIKE '2%')::int AS s2xx,
                   COUNT(*) FILTER (WHERE crl.status LIKE '3%')::int AS s3xx,
                   COUNT(*) FILTER (WHERE crl.status LIKE '4%')::int AS s4xx,
                   COUNT(*) FILTER (WHERE crl.status LIKE '5%')::int AS s5xx,
                   COUNT(*) FILTER (
                     WHERE crl.status IS NULL
                        OR crl.status = ''
                        OR crl.status !~ '^[2345]'
                   )::int AS other,
                   COUNT(*) FILTER (
                     WHERE NULLIF(TRIM(COALESCE(crl.title, crl.data->>'title', '')), '') IS NOT NULL
                   )::int AS with_title,
                   COALESCE(ROUND(AVG(NULLIF((crl.data->>'word_count')::numeric, 0))), 0)::int AS avg_word_count,
                   COUNT(*) FILTER (
                     WHERE COALESCE((crl.data->>'word_count')::int, 0) > 0
                       AND COALESCE((crl.data->>'word_count')::int, 0) < 300
                   )::int AS thin_pages
                FROM crawl_runs cr
                LEFT JOIN crawl_results crl ON crl.crawl_run_id = cr.id
                {runFilter}
                GROUP BY cr.id, cr.start_url, cr.created_at, cr.render_mode, cr.discovery_mode
                ORDER BY cr.id DESC
                """;

            await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var cmd = new NpgsqlCommand(sql, conn);
            if (maxRuns is > 0)
                cmd.Parameters.AddWithValue("maxRuns", maxRuns.Value);

            var result = new List<PortfolioCrawlSummaryRow>();
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var created = reader.GetFieldValue<DateTimeOffset>(2);
                result.Add(new PortfolioCrawlSummaryRow
                {
                    CrawlRunId = reader.GetInt64(0),
                    StartUrl = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    CreatedAt = PyIso.Format(created),
                    RenderMode = reader.IsDBNull(3) ? null : reader.GetString(3),
                    DiscoveryMode = reader.IsDBNull(4) ? null : reader.GetString(4),
                    UrlCount = reader.GetInt32(5),
                    S2xx = reader.GetInt32(6),
                    S3xx = reader.GetInt32(7),
                    S4xx = reader.GetInt32(8),
                    S5xx = reader.GetInt32(9),
                    Other = reader.GetInt32(10),
                    WithTitle = reader.GetInt32(11),
                    AvgWordCount = reader.GetInt32(12),
                    ThinPages = reader.GetInt32(13),
                });
            }

            return result;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "list_crawl_run_summaries failed; returning empty list");
            return [];
        }
    }

    public async Task<IReadOnlyDictionary<long, string>> ReadReportPayloadsPortfolioAsync(
        IReadOnlyList<long> reportIds, CancellationToken cancellationToken)
    {
        if (reportIds.Count == 0)
            return new Dictionary<long, string>();

        try
        {
            await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var cmd = new NpgsqlCommand(PortfolioPayloadSql, conn);
            cmd.Parameters.AddWithValue("ids", reportIds.ToArray());

            var outMap = new Dictionary<long, string>();
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var id = reader.GetInt64(0);
                var json = reader.GetString(1);
                outMap[id] = json;
            }

            return outMap;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "read_report_payloads_portfolio failed");
            return new Dictionary<long, string>();
        }
    }

    public async Task<string?> ReadReportPayloadAsync(long reportId, CancellationToken cancellationToken) =>
        await db.ReportPayloads
            .Where(r => r.Id == reportId)
            .Select(r => r.Data)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<long?> FindReportIdByCrawlRunIdAsync(long crawlRunId, CancellationToken cancellationToken)
    {
        try
        {
            await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var cmd = new NpgsqlCommand(
                """
                SELECT id FROM report_payload
                WHERE (data->>'crawl_run_id')::bigint = @crawlRunId
                ORDER BY id DESC
                LIMIT 1
                """,
                conn);
            cmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
            var result = await cmd.ExecuteScalarAsync(cancellationToken);
            return result is long id ? id : result is int i ? i : null;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "find report by crawl_run_id failed");
            return null;
        }
    }

    public async Task<bool> DeletePortfolioItemAsync(
        long? reportId, long? crawlRunId, CancellationToken cancellationToken)
    {
        var deleted = false;
        if (reportId is not null)
        {
            var count = await db.ReportPayloads
                .Where(r => r.Id == reportId.Value)
                .ExecuteDeleteAsync(cancellationToken);
            deleted = deleted || count > 0;
        }

        if (crawlRunId is not null)
        {
            var count = await db.CrawlRuns
                .Where(c => c.Id == crawlRunId.Value)
                .ExecuteDeleteAsync(cancellationToken);
            deleted = deleted || count > 0;
        }

        return deleted;
    }

    private static PortfolioReportRow MapReportRow(
        long id, string? canonicalDomain, string? siteName, DateTimeOffset generatedAt) =>
        new()
        {
            Id = id,
            CanonicalDomain = canonicalDomain,
            SiteName = siteName,
            GeneratedAt = PyIso.Format(generatedAt),
        };
}
