using Npgsql;

namespace CoreService.Api.Application.Repositories;

/// <summary>Batch-read stored HTML from crawl_page_html for optional HTML validation audits.</summary>
public sealed class CrawlPageHtmlReader(NpgsqlDataSource dataSource)
{
    public async Task<IReadOnlyList<(string Url, string Html)>> ReadBatchAsync(
        long crawlRunId,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        if (crawlRunId <= 0 || limit <= 0)
        {
            return [];
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT url, html
            FROM crawl_page_html
            WHERE crawl_run_id = @runId
              AND content_type ILIKE '%html%'
            ORDER BY url
            LIMIT @limit
            """,
            conn);
        cmd.Parameters.AddWithValue("runId", crawlRunId);
        cmd.Parameters.AddWithValue("limit", limit);

        var rows = new List<(string Url, string Html)>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var url = reader.IsDBNull(0) ? "" : reader.GetString(0);
            var html = reader.IsDBNull(1) ? "" : reader.GetString(1);
            if (!string.IsNullOrWhiteSpace(url) && html.Length >= 100)
            {
                rows.Add((url.Trim(), html));
            }
        }

        return rows;
    }
}
