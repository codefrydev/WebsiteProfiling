using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace Data.Application.Repositories;

public interface IContentDraftRepository
{
    Task<IReadOnlyList<Dictionary<string, object?>>> ListAsync(
        long propertyId,
        CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> GetAsync(long draftId, CancellationToken cancellationToken);

    Task<long> CreateAsync(
        long propertyId,
        string title,
        string targetKeyword,
        string? landingUrl,
        string status,
        string bodyHtml,
        string titleTag,
        string metaDescription,
        CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> UpdateAsync(
        long draftId,
        IReadOnlyDictionary<string, JsonElement> patch,
        CancellationToken cancellationToken);

    Task<bool> DeleteAsync(long draftId, CancellationToken cancellationToken);
}

public sealed class ContentDraftRepository(NpgsqlDataSource dataSource) : IContentDraftRepository
{
    private const string ListColumns = """
        id, property_id, title, target_keyword, landing_url, status,
        grade_score, created_at::text, updated_at::text
        """;

    private const string DetailColumns = """
        id, property_id, title, target_keyword, landing_url, status,
        body_html, title_tag, meta_description, grade_score, grade_snapshot,
        created_at::text, updated_at::text
        """;

    public async Task<IReadOnlyList<Dictionary<string, object?>>> ListAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             SELECT {ListColumns}
             FROM content_drafts
             WHERE property_id = @propertyId
             ORDER BY updated_at DESC
             LIMIT 100
             """,
            conn);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var list = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapListRow(reader));
        }

        return list;
    }

    public async Task<Dictionary<string, object?>?> GetAsync(
        long draftId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"SELECT {DetailColumns} FROM content_drafts WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", draftId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapDetailRow(reader) : null;
    }

    public async Task<long> CreateAsync(
        long propertyId,
        string title,
        string targetKeyword,
        string? landingUrl,
        string status,
        string bodyHtml,
        string titleTag,
        string metaDescription,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO content_drafts
                (property_id, title, target_keyword, landing_url, status,
                 body_html, title_tag, meta_description)
            VALUES (@propertyId, @title, @targetKeyword, @landingUrl, @status,
                    @bodyHtml, @titleTag, @metaDescription)
            RETURNING id
            """,
            conn);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("targetKeyword", targetKeyword);
        cmd.Parameters.AddWithValue("landingUrl", (object?)landingUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("bodyHtml", bodyHtml);
        cmd.Parameters.AddWithValue("titleTag", titleTag);
        cmd.Parameters.AddWithValue("metaDescription", metaDescription);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<Dictionary<string, object?>?> UpdateAsync(
        long draftId,
        IReadOnlyDictionary<string, JsonElement> patch,
        CancellationToken cancellationToken)
    {
        var sets = new List<string>();
        var parameters = new List<NpgsqlParameter> { new("id", draftId) };

        void AddString(string col, JsonElement el)
        {
            var val = el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText();
            if (col == "title")
            {
                val = string.IsNullOrWhiteSpace(val) ? "Untitled draft" : val.Trim();
            }
            else if (col == "landing_url")
            {
                val = string.IsNullOrWhiteSpace(val) ? null : val.Trim();
            }
            else if (col is "body_html" or "title_tag" or "meta_description")
            {
                val ??= "";
            }

            sets.Add($"{col} = @{col}");
            parameters.Add(new NpgsqlParameter(col, (object?)val ?? DBNull.Value));
        }

        if (patch.TryGetValue("title", out var titleEl))
        {
            AddString("title", titleEl);
        }

        if (patch.TryGetValue("target_keyword", out var kwEl))
        {
            AddString("target_keyword", kwEl);
        }

        if (patch.TryGetValue("landing_url", out var urlEl))
        {
            AddString("landing_url", urlEl);
        }

        if (patch.TryGetValue("status", out var statusEl))
        {
            AddString("status", statusEl);
        }

        if (patch.TryGetValue("body_html", out var bodyEl))
        {
            AddString("body_html", bodyEl);
        }

        if (patch.TryGetValue("title_tag", out var tagEl))
        {
            AddString("title_tag", tagEl);
        }

        if (patch.TryGetValue("meta_description", out var metaEl))
        {
            AddString("meta_description", metaEl);
        }

        if (patch.TryGetValue("grade_score", out var scoreEl))
        {
            sets.Add("grade_score = @grade_score");
            parameters.Add(new NpgsqlParameter("grade_score", scoreEl.ValueKind == JsonValueKind.Null
                ? DBNull.Value
                : scoreEl.GetDouble()));
        }

        if (patch.TryGetValue("grade_snapshot", out var snapEl))
        {
            sets.Add("grade_snapshot = @grade_snapshot");
            parameters.Add(new NpgsqlParameter("grade_snapshot", NpgsqlDbType.Jsonb)
            {
                Value = snapEl.ValueKind == JsonValueKind.Null ? DBNull.Value : snapEl.GetRawText(),
            });
        }

        if (sets.Count == 0)
        {
            return await GetAsync(draftId, cancellationToken);
        }

        sets.Add("updated_at = now()");
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             UPDATE content_drafts SET {string.Join(", ", sets)}
             WHERE id = @id
             RETURNING {DetailColumns}
             """,
            conn);
        cmd.Parameters.AddRange(parameters.ToArray());
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapDetailRow(reader) : null;
    }

    public async Task<bool> DeleteAsync(long draftId, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM content_drafts WHERE id = @id RETURNING id",
            conn);
        cmd.Parameters.AddWithValue("id", draftId);
        return await cmd.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static Dictionary<string, object?> MapListRow(NpgsqlDataReader reader) =>
        new()
        {
            ["id"] = reader.GetInt64(0),
            ["property_id"] = reader.GetInt64(1),
            ["title"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["target_keyword"] = reader.IsDBNull(3) ? null : reader.GetString(3),
            ["landing_url"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["status"] = reader.IsDBNull(5) ? null : reader.GetString(5),
            ["grade_score"] = reader.IsDBNull(6) ? null : reader.GetDouble(6),
            ["created_at"] = reader.IsDBNull(7) ? null : reader.GetString(7),
            ["updated_at"] = reader.IsDBNull(8) ? null : reader.GetString(8),
        };

    private static Dictionary<string, object?> MapDetailRow(NpgsqlDataReader reader)
    {
        object? gradeSnapshot = null;
        if (!reader.IsDBNull(10))
        {
            try
            {
                var raw = reader.GetFieldValue<string>(10);
                gradeSnapshot = JsonSerializer.Deserialize<object>(raw);
            }
            catch (JsonException)
            {
                gradeSnapshot = null;
            }
        }

        return new Dictionary<string, object?>
        {
            ["id"] = reader.GetInt64(0),
            ["property_id"] = reader.GetInt64(1),
            ["title"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["target_keyword"] = reader.IsDBNull(3) ? null : reader.GetString(3),
            ["landing_url"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["status"] = reader.IsDBNull(5) ? null : reader.GetString(5),
            ["body_html"] = reader.IsDBNull(6) ? "" : reader.GetString(6),
            ["title_tag"] = reader.IsDBNull(7) ? "" : reader.GetString(7),
            ["meta_description"] = reader.IsDBNull(8) ? "" : reader.GetString(8),
            ["grade_score"] = reader.IsDBNull(9) ? null : reader.GetDouble(9),
            ["grade_snapshot"] = gradeSnapshot,
            ["created_at"] = reader.IsDBNull(11) ? null : reader.GetString(11),
            ["updated_at"] = reader.IsDBNull(12) ? null : reader.GetString(12),
        };
    }
}
