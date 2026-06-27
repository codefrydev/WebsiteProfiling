using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Slice;

/// <summary>Crawl dataframe filters — mirrors Python <c>_slice.crawl_filter</c>.</summary>
public static class CrawlSliceHelpers
{
    public static JsonObject CrawlFilter(
        IReadOnlyList<JsonObject> rows,
        string status = "",
        string urlContains = "",
        bool? hasSchema = null,
        string schemaType = "",
        int limit = 30,
        int maxCap = 30)
    {
        if (rows.Count == 0)
        {
            return new JsonObject
            {
                ["pages"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        IEnumerable<JsonObject> filtered = rows;
        if (!string.IsNullOrEmpty(status))
        {
            filtered = filtered.Where(r => string.Equals(JsonCoercion.AsString(r["status"]), status, StringComparison.Ordinal));
        }

        if (!string.IsNullOrEmpty(urlContains))
        {
            var needle = urlContains.ToLowerInvariant();
            filtered = filtered.Where(r => (JsonCoercion.AsString(r["url"]) ?? "").ToLowerInvariant().Contains(needle, StringComparison.Ordinal));
        }

        if (hasSchema is not null)
        {
            filtered = filtered.Where(r => RowHasSchema(r) == hasSchema.Value);
        }

        if (!string.IsNullOrWhiteSpace(schemaType))
        {
            var typeNeedle = schemaType.ToLowerInvariant();
            filtered = filtered.Where(r => RowSchemaTypes(r).Contains(typeNeedle, StringComparison.Ordinal));
        }

        var pages = filtered.Select(r => new JsonObject
        {
            ["url"] = JsonCoercion.AsString(r["url"]) ?? "",
            ["status"] = JsonCoercion.AsString(r["status"]) ?? "",
            ["title"] = JsonCoercion.AsString(r["title"]) ?? "",
            ["has_schema"] = RowHasSchema(r),
            ["schema_types"] = new JsonArray(RowSchemaTypesList(r).Select(t => JsonValue.Create(t)).ToArray()),
        }).ToList();

        var sliced = PayloadSliceHelpers.CapList(pages.Cast<JsonNode?>().ToList(), limit, maxCap);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static bool RowHasSchema(JsonObject row)
    {
        var val = (JsonCoercion.AsString(row["has_schema"]) ?? "").ToLowerInvariant();
        return val is "true" or "1" or "yes";
    }

    /// <summary>Status code as string — handles JSON numbers (e.g. 200) and strings.</summary>
    public static string RowStatus(JsonObject row)
    {
        var node = row["status"];
        if (node is null)
        {
            return "";
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<string>(out var s))
            {
                return s.Trim();
            }

            if (value.TryGetValue<int>(out var i))
            {
                return i.ToString();
            }

            if (value.TryGetValue<long>(out var l))
            {
                return l.ToString();
            }

            if (value.TryGetValue<double>(out var d))
            {
                return ((int)d).ToString();
            }
        }

        return node.ToString()?.Trim() ?? "";
    }

    public static bool IsSuccess2xx(JsonObject row)
    {
        var status = RowStatus(row);
        return status.Length > 0 && status[0] == '2';
    }

    public static IReadOnlyList<string> RowSchemaTypesList(JsonObject row)
    {
        var pa = ParsePageAnalysisInternal(row);
        JsonNode? types = pa["json_ld_types"] ?? pa["schema_types"];
        if (types is JsonValue value && value.TryGetValue(out string? single) && !string.IsNullOrWhiteSpace(single))
        {
            return [single];
        }

        if (types is JsonArray array)
        {
            return array.Select(n => JsonCoercion.AsString(n) ?? "").Where(t => t.Length > 0).ToList();
        }

        return [];
    }

    public static string RowSchemaTypes(JsonObject row)
        => string.Join(' ', RowSchemaTypesList(row)).ToLowerInvariant();

    public static JsonObject ParsePageAnalysis(JsonObject row)
    {
        if (row["page_analysis"] is JsonObject dict)
        {
            return dict;
        }

        if (row["page_analysis"] is JsonValue value && value.TryGetValue(out string? text) && !string.IsNullOrWhiteSpace(text))
        {
            try
            {
                return JsonNode.Parse(text) as JsonObject ?? [];
            }
            catch (JsonException)
            {
                return [];
            }
        }

        return [];
    }

    private static JsonObject ParsePageAnalysisInternal(JsonObject row) => ParsePageAnalysis(row);
}
