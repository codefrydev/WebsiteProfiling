using System.Text.Json;

namespace Data.Application.Content;

/// <summary>Heuristic content brief — port of Python <c>ai_service_client.generate_content_brief</c>.</summary>
public static class ContentBriefBuilder
{
    public static Dictionary<string, object?> Build(
        string keyword,
        IReadOnlyList<JsonElement>? rows,
        IReadOnlyList<string>? gaps)
    {
        var bullets = new List<string>();
        if (gaps is not null)
        {
            foreach (var gap in gaps.Take(8))
            {
                if (!string.IsNullOrWhiteSpace(gap))
                {
                    bullets.Add($"Gap: {gap}");
                }
            }
        }

        if (rows is not null)
        {
            foreach (var row in rows.Take(5))
            {
                if (row.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var kw = GetString(row, "keyword") ?? GetString(row, "query");
                if (string.IsNullOrWhiteSpace(kw))
                {
                    continue;
                }

                var clicks = GetInt(row, "clicks") ?? GetInt(row, "gsc_clicks");
                bullets.Add(clicks is > 0
                    ? $"Target cluster around '{kw}' ({clicks} clicks)"
                    : $"Target cluster around '{kw}'");
            }
        }

        if (bullets.Count == 0)
        {
            bullets.Add($"Create comprehensive content targeting '{keyword}'");
        }

        return new Dictionary<string, object?>
        {
            ["keyword"] = keyword,
            ["summary"] = bullets,
            ["provenance"] = "Estimated",
            ["use_llm"] = false,
        };
    }

    public static List<JsonElement>? ParseRows(JsonElement body)
    {
        if (!body.TryGetProperty("rows", out var rowsEl) || rowsEl.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        return rowsEl.EnumerateArray().ToList();
    }

    public static List<string>? ParseGaps(JsonElement body)
    {
        if (!body.TryGetProperty("gaps", out var gapsEl) || gapsEl.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        return gapsEl.EnumerateArray()
            .Select(g => g.ValueKind == JsonValueKind.String ? g.GetString() ?? "" : g.ToString())
            .Where(g => g.Length > 0)
            .ToList();
    }

    private static string? GetString(JsonElement row, string name) =>
        row.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
            ? el.GetString()
            : null;

    private static int? GetInt(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var el))
        {
            return null;
        }

        return el.ValueKind switch
        {
            JsonValueKind.Number when el.TryGetInt32(out var n) => n,
            JsonValueKind.String when int.TryParse(el.GetString(), out var parsed) => parsed,
            _ => null,
        };
    }
}
