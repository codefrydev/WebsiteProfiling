using System.Globalization;
using System.Text.Json;
using ClosedXML.Excel;

namespace Data.Rendering;

public sealed class AuditWorkbookGenerator
{
    private static readonly string[] UrlColumns =
    [
        "url", "status", "title", "meta_description", "h1",
        "canonical_url", "inlinks", "outlinks", "depth", "word_count",
    ];

    private static readonly string[] EdgeColumns =
    [
        "from_url", "to_url", "anchor_text", "rel",
        "is_nofollow", "is_sponsored", "is_ugc", "link_type", "position",
    ];

    private static readonly string[] RedirectColumns =
    [
        "url", "message", "priority", "recommendation",
    ];

    private static readonly string[] IssueColumns =
    [
        "category", "priority", "message", "url",
        "impact_score", "gsc_clicks", "gsc_impressions", "ga4_sessions",
        "recommendation",
    ];

    public byte[] Generate(JsonElement payload)
    {
        using var workbook = new XLWorkbook();

        WriteSheetFromObjects(workbook, "Internal URLs", GetArray(payload, "links"), UrlColumns);
        WriteSheetFromObjects(workbook, "Links", GetArray(payload, "link_edges"), EdgeColumns);
        WriteSheetFromObjects(workbook, "Redirects", GetArray(payload, "redirects"), RedirectColumns);
        WriteIssueSheet(workbook, payload);
        WriteCustomFieldsSheet(workbook, payload);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static void WriteIssueSheet(XLWorkbook workbook, JsonElement payload)
    {
        var rows = new List<Dictionary<string, object?>>();
        if (payload.TryGetProperty("categories", out var categories) && categories.ValueKind == JsonValueKind.Array)
        {
            foreach (var cat in categories.EnumerateArray())
            {
                var catName = GetString(cat, "name") ?? GetString(cat, "id") ?? "";
                if (!cat.TryGetProperty("issues", out var issues) || issues.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var issue in issues.EnumerateArray())
                {
                    if (issue.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    var row = ObjectToRow(issue);
                    row["category"] = catName;
                    rows.Add(row);
                }
            }
        }

        WriteSheetFromRows(workbook, "Issues", rows, IssueColumns);
    }

    private static void WriteCustomFieldsSheet(XLWorkbook workbook, JsonElement payload)
    {
        var links = GetArray(payload, "links");
        if (links.Count == 0)
        {
            return;
        }

        var fieldNames = new SortedSet<string>(StringComparer.Ordinal);
        var rows = new List<Dictionary<string, object?>>();

        foreach (var link in links)
        {
            if (link.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var url = GetString(link, "url");
            var customExtract = GetString(link, "custom_extract");
            var fields = ParseCustomFields(link);
            if (string.IsNullOrWhiteSpace(url) || (string.IsNullOrWhiteSpace(customExtract) && fields.Count == 0))
            {
                continue;
            }

            foreach (var key in fields.Keys)
            {
                fieldNames.Add(key);
            }

            var row = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["url"] = url,
                ["custom_extract"] = customExtract ?? "",
            };
            foreach (var (key, value) in fields)
            {
                row[key] = value;
            }

            rows.Add(row);
        }

        if (rows.Count == 0)
        {
            return;
        }

        var columns = new List<string> { "url", "custom_extract" };
        columns.AddRange(fieldNames);
        WriteSheetFromRows(workbook, "Custom Fields", rows, columns);
    }

    private static List<JsonElement> GetArray(JsonElement payload, string name)
    {
        var rows = new List<JsonElement>();
        if (!payload.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Array)
        {
            return rows;
        }

        foreach (var item in el.EnumerateArray())
        {
            rows.Add(item);
        }

        return rows;
    }

    private static void WriteSheetFromObjects(
        XLWorkbook workbook,
        string sheetName,
        IReadOnlyList<JsonElement> objects,
        IReadOnlyList<string> columns)
    {
        if (objects.Count == 0)
        {
            return;
        }

        var rows = objects
            .Where(o => o.ValueKind == JsonValueKind.Object)
            .Select(ObjectToRow)
            .ToList();
        WriteSheetFromRows(workbook, sheetName, rows, columns);
    }

    private static void WriteSheetFromRows(
        XLWorkbook workbook,
        string sheetName,
        IReadOnlyList<Dictionary<string, object?>> rows,
        IReadOnlyList<string> columns)
    {
        if (rows.Count == 0)
        {
            return;
        }

        var sheet = workbook.Worksheets.Add(sheetName);
        for (var c = 0; c < columns.Count; c++)
        {
            sheet.Cell(1, c + 1).Value = columns[c];
        }

        sheet.Row(1).Style.Font.Bold = true;

        for (var r = 0; r < rows.Count; r++)
        {
            var row = rows[r];
            for (var c = 0; c < columns.Count; c++)
            {
                var key = columns[c];
                row.TryGetValue(key, out var value);
                sheet.Cell(r + 2, c + 1).Value = value switch
                {
                    null => Blank.Value,
                    bool b => b,
                    int i => i,
                    long l => l,
                    double d => d,
                    _ => value.ToString() ?? "",
                };
            }
        }

        sheet.Columns().AdjustToContents();
    }

    private static Dictionary<string, object?> ObjectToRow(JsonElement obj)
    {
        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var prop in obj.EnumerateObject())
        {
            row[prop.Name] = JsonValue(prop.Value);
        }

        return row;
    }

    private static object? JsonValue(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number when el.TryGetInt64(out var l) => l,
        JsonValueKind.Number => el.GetDouble(),
        JsonValueKind.String => el.GetString(),
        _ => el.ToString(),
    };

    private static string CustomFieldString(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => "",
        JsonValueKind.String => el.GetString() ?? "",
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        // Plain decimal string instead of raw JSON (avoids scientific notation).
        JsonValueKind.Number => el.TryGetInt64(out var l)
            ? l.ToString(CultureInfo.InvariantCulture)
            : el.GetDouble().ToString(CultureInfo.InvariantCulture),
        // Nested object/array can't fit a flat cell as a scalar — compact JSON.
        _ => el.GetRawText(),
    };

    private static Dictionary<string, string> ParseCustomFields(JsonElement link)
    {
        if (!link.TryGetProperty("custom_fields", out var raw))
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }

        if (raw.ValueKind == JsonValueKind.Object)
        {
            var dict = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var prop in raw.EnumerateObject())
            {
                dict[prop.Name] = CustomFieldString(prop.Value);
            }

            return dict;
        }

        if (raw.ValueKind != JsonValueKind.String)
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }

        var text = raw.GetString()?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }

        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new Dictionary<string, string>(StringComparer.Ordinal);
            }

            var parsed = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                parsed[prop.Name] = CustomFieldString(prop.Value);
            }

            return parsed;
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }
    }

    private static string? GetString(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return prop.GetString();
    }
}
