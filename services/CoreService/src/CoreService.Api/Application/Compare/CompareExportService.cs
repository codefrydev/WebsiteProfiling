using System.Text;
using System.Text.Json;
using Npgsql;

namespace CoreService.Api.Application.Compare;

public sealed class CompareExportService(NpgsqlDataSource dataSource)
{
    public async Task<(bool Found, string Csv)> ExportAsync(
        long reportIdA,
        long reportIdB,
        CancellationToken cancellationToken)
    {
        var payloadA = await ReadPayloadAsync(reportIdA, cancellationToken);
        var payloadB = await ReadPayloadAsync(reportIdB, cancellationToken);
        if (payloadA is null || payloadB is null)
        {
            return (false, "");
        }

        var lines = new StringBuilder("Category,Issue Title,Priority,Change\n");
        var catsA = IndexCategories(payloadA.Value);
        var catsB = IndexCategories(payloadB.Value);
        foreach (var key in catsA.Keys.Union(catsB.Keys))
        {
            catsA.TryGetValue(key, out var catA);
            catsB.TryGetValue(key, out var catB);
            var issuesA = IndexIssues(catA);
            var issuesB = IndexIssues(catB);
            foreach (var title in issuesA.Keys.Union(issuesB.Keys))
            {
                var inA = issuesA.ContainsKey(title);
                var inB = issuesB.ContainsKey(title);
                var change = inA && !inB ? "removed" : !inA && inB ? "added" : "unchanged";
                var priority = (issuesB.GetValueOrDefault(title) ?? issuesA.GetValueOrDefault(title))
                    ?.GetValueOrDefault("priority")?.ToString() ?? "";
                lines.Append(CsvEscape(key));
                lines.Append(',');
                lines.Append(CsvEscape(title));
                lines.Append(',');
                lines.Append(priority);
                lines.Append(',');
                lines.AppendLine(change);
            }
        }

        return (true, lines.ToString());
    }

    private async Task<JsonElement?> ReadPayloadAsync(long reportId, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "SELECT data FROM report_payload WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", reportId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0))
        {
            return null;
        }

        var raw = reader.GetFieldValue<string>(0);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static Dictionary<string, JsonElement> IndexCategories(JsonElement payload)
    {
        var map = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (!payload.TryGetProperty("categories", out var categories)
            || categories.ValueKind != JsonValueKind.Array)
        {
            return map;
        }

        foreach (var cat in categories.EnumerateArray())
        {
            if (cat.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var key = cat.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString() ?? ""
                : cat.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
                    ? nameEl.GetString() ?? ""
                    : "";
            if (!string.IsNullOrEmpty(key))
            {
                map[key] = cat;
            }
        }

        return map;
    }

    private static Dictionary<string, Dictionary<string, object?>> IndexIssues(JsonElement? category)
    {
        var map = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        if (category is null
            || category.Value.ValueKind != JsonValueKind.Object
            || !category.Value.TryGetProperty("issues", out var issues)
            || issues.ValueKind != JsonValueKind.Array)
        {
            return map;
        }

        foreach (var issue in issues.EnumerateArray())
        {
            if (issue.ValueKind != JsonValueKind.Object
                || !issue.TryGetProperty("title", out var titleEl)
                || titleEl.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var title = titleEl.GetString() ?? "";
            object? priority = issue.TryGetProperty("priority", out var priEl)
                ? priEl.ValueKind switch
                {
                    JsonValueKind.String => priEl.GetString(),
                    JsonValueKind.Number => priEl.GetRawText(),
                    _ => null,
                }
                : null;
            map[title] = new Dictionary<string, object?> { ["priority"] = priority };
        }

        return map;
    }

    private static string CsvEscape(string val)
    {
        if (val.Any(c => c is '"' or ',' or '\n'))
        {
            return $"\"{val.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
        }

        return val;
    }
}
