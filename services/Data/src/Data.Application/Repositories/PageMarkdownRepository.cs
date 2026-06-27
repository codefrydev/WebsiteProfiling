using Data.Application.Json;
using Npgsql;

namespace Data.Application.Repositories;

public interface IPageMarkdownRepository
{
    Task<(IReadOnlyList<Dictionary<string, object?>> Items, int Total)> ListAsync(
        long crawlRunId,
        int limit,
        int offset,
        string query,
        CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> ReadContentAsync(
        long crawlRunId,
        string url,
        CancellationToken cancellationToken);

    Task<int> DeleteForRunAsync(long crawlRunId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Dictionary<string, object?>>> ListRunsAsync(
        long? propertyId,
        CancellationToken cancellationToken);
}

public interface IPipelineJobEnqueueRepository
{
    Task<bool> EnqueueAsync(
        string jobId,
        string jobType,
        string command,
        CancellationToken cancellationToken);
}

public sealed class PageMarkdownRepository(NpgsqlDataSource dataSource) : IPageMarkdownRepository
{
    public async Task<(IReadOnlyList<Dictionary<string, object?>> Items, int Total)> ListAsync(
        long crawlRunId,
        int limit,
        int offset,
        string query,
        CancellationToken cancellationToken)
    {
        limit = Math.Clamp(limit, 1, 100);
        offset = Math.Max(0, offset);
        var q = (query ?? "").Trim();

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        var total = 0;
        if (!string.IsNullOrEmpty(q))
        {
            await using var countCmd = new NpgsqlCommand(
                """
                SELECT COUNT(*) FROM crawl_page_markdown
                WHERE crawl_run_id = @crawlRunId AND lower(url) LIKE @pattern
                """,
                conn);
            countCmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
            countCmd.Parameters.AddWithValue("pattern", $"%{q.ToLowerInvariant()}%");
            total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(cancellationToken));
        }
        else
        {
            await using var countCmd = new NpgsqlCommand(
                "SELECT COUNT(*) FROM crawl_page_markdown WHERE crawl_run_id = @crawlRunId",
                conn);
            countCmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
            total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(cancellationToken));
        }

        await using var cmd = new NpgsqlCommand(
            string.IsNullOrEmpty(q)
                ? """
                  SELECT url, title, word_count, strategy, extracted_at
                  FROM crawl_page_markdown
                  WHERE crawl_run_id = @crawlRunId
                  ORDER BY url
                  LIMIT @limit OFFSET @offset
                  """
                : """
                  SELECT url, title, word_count, strategy, extracted_at
                  FROM crawl_page_markdown
                  WHERE crawl_run_id = @crawlRunId AND lower(url) LIKE @pattern
                  ORDER BY url
                  LIMIT @limit OFFSET @offset
                  """,
            conn);
        cmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
        cmd.Parameters.AddWithValue("limit", limit);
        cmd.Parameters.AddWithValue("offset", offset);
        if (!string.IsNullOrEmpty(q))
        {
            cmd.Parameters.AddWithValue("pattern", $"%{q.ToLowerInvariant()}%");
        }

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var items = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new Dictionary<string, object?>
            {
                ["url"] = reader.IsDBNull(0) ? null : reader.GetString(0),
                ["title"] = reader.IsDBNull(1) ? null : reader.GetString(1),
                ["word_count"] = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                ["strategy"] = reader.IsDBNull(3) ? null : reader.GetString(3),
                ["extracted_at"] = FormatExtractedAt(reader, 4),
            });
        }

        return (items, total);
    }

    public async Task<Dictionary<string, object?>?> ReadContentAsync(
        long crawlRunId,
        string url,
        CancellationToken cancellationToken)
    {
        var norm = (url ?? "").Trim();
        if (string.IsNullOrEmpty(norm))
        {
            return null;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT url, title, markdown, word_count, strategy, source_byte_length, extracted_at
            FROM crawl_page_markdown
            WHERE crawl_run_id = @crawlRunId AND url = @url
            """,
            conn);
        cmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
        cmd.Parameters.AddWithValue("url", norm);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new Dictionary<string, object?>
        {
            ["url"] = reader.IsDBNull(0) ? null : reader.GetString(0),
            ["title"] = reader.IsDBNull(1) ? null : reader.GetString(1),
            ["markdown"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["word_count"] = reader.IsDBNull(3) ? null : reader.GetInt32(3),
            ["strategy"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["source_byte_length"] = reader.IsDBNull(5) ? null : reader.GetInt32(5),
            ["extracted_at"] = FormatExtractedAt(reader, 6),
        };
    }

    public async Task<int> DeleteForRunAsync(long crawlRunId, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM crawl_page_markdown WHERE crawl_run_id = @crawlRunId",
            conn);
        cmd.Parameters.AddWithValue("crawlRunId", crawlRunId);
        return await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Dictionary<string, object?>>> ListRunsAsync(
        long? propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = propertyId is > 0
            ? new NpgsqlCommand(
                """
                SELECT cr.id, cr.created_at, cr.start_url,
                       COALESCE(html_counts.cnt, 0) AS html_page_count,
                       COALESCE(md_counts.cnt, 0) AS markdown_page_count
                FROM crawl_runs cr
                LEFT JOIN (
                    SELECT crawl_run_id, COUNT(*)::int AS cnt
                    FROM crawl_page_html GROUP BY crawl_run_id
                ) html_counts ON html_counts.crawl_run_id = cr.id
                LEFT JOIN (
                    SELECT crawl_run_id, COUNT(*)::int AS cnt
                    FROM crawl_page_markdown GROUP BY crawl_run_id
                ) md_counts ON md_counts.crawl_run_id = cr.id
                WHERE cr.property_id = @propertyId
                ORDER BY cr.id DESC
                LIMIT 50
                """,
                conn)
            : new NpgsqlCommand(
                """
                SELECT cr.id, cr.created_at, cr.start_url,
                       COALESCE(html_counts.cnt, 0) AS html_page_count,
                       COALESCE(md_counts.cnt, 0) AS markdown_page_count
                FROM crawl_runs cr
                LEFT JOIN (
                    SELECT crawl_run_id, COUNT(*)::int AS cnt
                    FROM crawl_page_html GROUP BY crawl_run_id
                ) html_counts ON html_counts.crawl_run_id = cr.id
                LEFT JOIN (
                    SELECT crawl_run_id, COUNT(*)::int AS cnt
                    FROM crawl_page_markdown GROUP BY crawl_run_id
                ) md_counts ON md_counts.crawl_run_id = cr.id
                ORDER BY cr.id DESC
                LIMIT 50
                """,
                conn);

        if (propertyId is > 0)
        {
            cmd.Parameters.AddWithValue("propertyId", propertyId.Value);
        }

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var runs = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            runs.Add(new Dictionary<string, object?>
            {
                ["id"] = reader.GetInt64(0),
                ["created_at"] = reader.IsDBNull(1) ? null : PyIso.Format(reader.GetFieldValue<DateTimeOffset>(1)),
                ["start_url"] = reader.IsDBNull(2) ? null : reader.GetString(2),
                ["html_page_count"] = reader.GetInt32(3),
                ["markdown_page_count"] = reader.GetInt32(4),
            });
        }

        return runs;
    }

    private static string? FormatExtractedAt(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetValue(ordinal);
        return value switch
        {
            DateTimeOffset dto => PyIso.Format(dto),
            DateTime dt => PyIso.Format(new DateTimeOffset(dt.ToUniversalTime())),
            _ => value.ToString(),
        };
    }
}

public sealed class PipelineJobEnqueueRepository(NpgsqlDataSource dataSource) : IPipelineJobEnqueueRepository
{
    public async Task<bool> EnqueueAsync(
        string jobId,
        string jobType,
        string command,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO pipeline_jobs (id, job_type, status, command, property_id, config_hash)
            SELECT @id::uuid, @jobType, 'pending', @command, NULL, NULL
            WHERE NOT EXISTS (
                SELECT 1 FROM pipeline_jobs WHERE status IN ('pending', 'running')
            )
            RETURNING id
            """,
            conn);
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.Parameters.AddWithValue("jobType", jobType);
        cmd.Parameters.AddWithValue("command", command);
        return await cmd.ExecuteScalarAsync(cancellationToken) is not null;
    }
}
