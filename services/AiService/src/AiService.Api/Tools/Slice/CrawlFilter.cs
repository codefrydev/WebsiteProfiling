using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Crawl;

namespace AiService.Api.Tools.Slice;

/// <summary>
/// Crawl row filtering helpers — faithful port of Python
/// <c>website_profiling.tools.audit_tools._slice</c> (crawl_filter and its private helpers).
/// </summary>
public static class CrawlFilter
{
    /// <summary>
    /// Filter crawl rows and return a paged result. Mirrors Python <c>crawl_filter</c>.
    /// </summary>
    public static JsonObject Filter(
        IReadOnlyList<JsonObject>? rows,
        string status = "",
        string urlContains = "",
        bool? hasSchema = null,
        string schemaType = "",
        int limit = 30,
        int maxCap = 30)
        => FilterRows(
            rows?.Select(Mapping.CrawlRowMapper.FromJsonObject).ToList(),
            status,
            urlContains,
            hasSchema,
            schemaType,
            limit,
            maxCap);

    /// <summary>Typed crawl filter — preferred for native handlers.</summary>
    public static JsonObject FilterRows(
        IReadOnlyList<CrawlRow>? rows,
        string status = "",
        string urlContains = "",
        bool? hasSchema = null,
        string schemaType = "",
        int limit = 30,
        int maxCap = 30)
    {
        if (rows is null || rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["truncated"] = false };
        }

        IEnumerable<CrawlRow> filtered = rows;

        if (!string.IsNullOrEmpty(status))
        {
            filtered = filtered.Where(r => r.Status == status);
        }

        if (!string.IsNullOrEmpty(urlContains))
        {
            var needle = urlContains.ToLowerInvariant();
            filtered = filtered.Where(r => r.Url.ToLowerInvariant().Contains(needle));
        }

        if (hasSchema is bool hs)
        {
            filtered = filtered.Where(r => r.HasSchema == hs);
        }

        if (!string.IsNullOrEmpty(schemaType))
        {
            var needle = schemaType.ToLowerInvariant();
            filtered = filtered.Where(r => string.Join(" ", r.SchemaTypes).ToLowerInvariant().Contains(needle));
        }

        var pages = filtered.Select(r => (JsonNode?)new JsonObject
        {
            ["url"] = r.Url,
            ["status"] = r.Status,
            ["title"] = r.Title,
            ["has_schema"] = r.HasSchema,
            ["schema_types"] = SchemaTypesToArray(r.SchemaTypes),
        }).ToList();

        var cap = Math.Max(1, Math.Min(limit, maxCap));
        var total = pages.Count;
        var truncated = total > cap;
        var slice = new JsonArray();
        for (var i = 0; i < Math.Min(cap, total); i++)
        {
            slice.Add(pages[i]?.DeepClone());
        }

        return new JsonObject { ["pages"] = slice, ["total"] = total, ["truncated"] = truncated };
    }

    /// <summary>
    /// Whether a crawl row has structured schema markup. Mirrors Python <c>_row_has_schema</c>.
    /// </summary>
    public static bool RowHasSchema(JsonObject row)
    {
        var node = row["has_schema"];
        if (node is JsonValue v)
        {
            if (v.TryGetValue<bool>(out var b))
            {
                return b;
            }

            if (v.TryGetValue<string>(out var s))
            {
                return s.ToLowerInvariant() is "true" or "1" or "yes";
            }

            if (v.TryGetValue<int>(out var i))
            {
                return i == 1;
            }
        }

        return false;
    }

    public static bool RowHasSchema(CrawlRow row) => row.HasSchema;

    /// <summary>
    /// Schema type strings from page_analysis.json_ld_types / schema_types. Mirrors
    /// Python <c>_row_schema_types_list</c>.
    /// </summary>
    public static IReadOnlyList<string> RowSchemaTypesList(JsonObject row)
    {
        var pa = ParsePageAnalysis(row["page_analysis"]);
        if (pa is null)
        {
            return Array.Empty<string>();
        }

        var typesNode = pa["json_ld_types"] ?? pa["schema_types"];
        if (typesNode is null)
        {
            return Array.Empty<string>();
        }

        if (typesNode is JsonArray arr)
        {
            return arr
                .Select(NodeStr)
                .Where(s => s.Length > 0)
                .ToList();
        }

        if (typesNode is JsonValue sv && sv.TryGetValue<string>(out var single) && single.Length > 0)
        {
            return new[] { single };
        }

        return Array.Empty<string>();
    }

    private static string NodeStr(JsonNode? node)
    {
        if (node is null)
        {
            return "";
        }

        if (node is JsonValue v)
        {
            if (v.TryGetValue<string>(out var s))
            {
                return s ?? "";
            }

            return v.ToString() ?? "";
        }

        return "";
    }

    private static JsonObject? ParsePageAnalysis(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            return obj;
        }

        if (node is JsonValue sv && sv.TryGetValue<string>(out var raw) && !string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                return JsonNode.Parse(raw) as JsonObject;
            }
            catch (System.Text.Json.JsonException) { }
        }

        return null;
    }

    private static JsonArray SchemaTypesToArray(IReadOnlyList<string> types)
    {
        var arr = new JsonArray();
        foreach (var t in types)
        {
            arr.Add(t);
        }

        return arr;
    }
}
