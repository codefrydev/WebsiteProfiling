using System.Text.Json.Nodes;
using AiService.Api.Tools.Slice;
using WebsiteProfiling.Contracts.Crawl;

namespace AiService.Api.Tools.Mapping;

public static class CrawlRowMapper
{
    public static CrawlRow FromJsonObject(JsonObject row)
    {
        var schemaTypes = CrawlFilter.RowSchemaTypesList(row);
        return new CrawlRow
        {
            Url = NodeStr(row["url"]),
            FetchMethod = NodeStr(row["fetch_method"]),
            Status = NodeStr(row["status"]),
            Title = NodeStr(row["title"]),
            HasSchema = CrawlFilter.RowHasSchema(row),
            SchemaTypes = schemaTypes,
            PageAnalysisJson = row["page_analysis"]?.ToJsonString(),
        };
    }

    public static IReadOnlyList<CrawlRow> FromJsonObjects(IReadOnlyList<JsonObject>? rows)
    {
        if (rows is null || rows.Count == 0)
        {
            return [];
        }

        return rows.Select(FromJsonObject).ToList();
    }

    public static JsonObject ToJsonObject(CrawlRow row)
    {
        var obj = new JsonObject
        {
            ["url"] = row.Url,
            ["fetch_method"] = row.FetchMethod,
            ["status"] = row.Status,
            ["title"] = row.Title,
            ["has_schema"] = row.HasSchema,
            ["schema_types"] = new JsonArray(row.SchemaTypes.Select(t => JsonValue.Create(t)).ToArray<JsonNode?>()),
        };

        if (!string.IsNullOrEmpty(row.PageAnalysisJson))
        {
            try
            {
                obj["page_analysis"] = JsonNode.Parse(row.PageAnalysisJson);
            }
            catch (System.Text.Json.JsonException)
            {
                obj["page_analysis"] = row.PageAnalysisJson;
            }
        }

        return obj;
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
}
