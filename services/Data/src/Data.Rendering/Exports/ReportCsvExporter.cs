using System.Text;
using System.Text.Json;

namespace Data.Rendering.Exports;

/// <summary>
/// CSV export of a report payload. Faithful port of the Python <c>export_audit_csv</c> +
/// <c>export_audit_data</c> helpers (<c>_executive_export_data</c>, <c>_executive_source_label</c>,
/// <c>_issues_rows</c>, <c>_issue_recommendation</c>, <c>category_display_name</c>). Section/column
/// order and CSV dialect (comma, double-quote, CRLF line endings, minimal quoting) match Python's
/// <c>csv.writer</c> so existing CSV consumers are unaffected.
/// </summary>
public sealed class ReportCsvExporter
{
    // LEGACY_CATEGORY_DISPLAY from reporting/terminology.py — remaps older category names only.
    private static readonly Dictionary<string, string> LegacyCategoryDisplay = new(StringComparer.Ordinal)
    {
        ["HTML & Accessibility"] = "Accessibility & markup",
        ["HTML/Accessibility"] = "Accessibility & markup",
        ["Link Health"] = "Links",
        ["Mobile Optimization"] = "Mobile SEO",
        ["Content intelligence"] = "Content quality",
    };

    private static readonly char[] CsvSpecial = [',', '"', '\r', '\n'];

    public string Generate(JsonElement payload)
    {
        var sb = new StringBuilder();
        var obj = payload.ValueKind == JsonValueKind.Object ? payload : default;

        Row(sb, "# Site Audit export");
        Row(sb, "site_name", Cell(obj, "site_name"));
        Row(sb, "report_generated_at", Cell(obj, "report_generated_at"));

        if (obj.ValueKind == JsonValueKind.Object
            && obj.TryGetProperty("report_meta", out var meta)
            && meta.ValueKind == JsonValueKind.Object
            && meta.EnumerateObject().Any())
        {
            var sources = new List<string>();
            if (meta.TryGetProperty("data_sources", out var ds) && ds.ValueKind == JsonValueKind.Array)
            {
                foreach (var d in ds.EnumerateArray())
                {
                    sources.Add(d.ValueKind == JsonValueKind.String ? d.GetString() ?? "" : d.GetRawText());
                }
            }
            Row(sb, "data_sources", string.Join(", ", sources));
        }

        Row(sb); // blank
        Row(sb, "url", "status", "title", "inlinks", "word_count");
        foreach (var link in ArrayItems(obj, "links"))
        {
            if (link.ValueKind != JsonValueKind.Object)
            {
                continue;
            }
            Row(sb,
                Cell(link, "url"), Cell(link, "status"), Cell(link, "title"),
                Cell(link, "inlinks"), Cell(link, "word_count"));
        }

        var (summary, priorities, source) = Executive(obj);
        if (summary.Length > 0 || priorities.Count > 0)
        {
            Row(sb); // blank
            Row(sb, "# Executive summary");
            Row(sb, "source", ExecutiveSourceLabel(source));
            if (summary.Length > 0)
            {
                Row(sb, "summary", summary);
            }
            for (var i = 0; i < priorities.Count; i++)
            {
                Row(sb, $"priority_{i + 1}", priorities[i]);
            }
        }

        Row(sb); // blank
        Row(sb, "category", "priority", "message", "url", "recommendation", "llm_recommendation");
        foreach (var cat in ArrayItems(obj, "categories"))
        {
            if (cat.ValueKind != JsonValueKind.Object)
            {
                continue;
            }
            var ui = CategoryDisplayName(Cell(cat, "name"));
            foreach (var issue in ArrayItems(cat, "issues"))
            {
                if (issue.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }
                var (rec, llm) = IssueRecommendation(issue);
                Row(sb,
                    ui, Cell(issue, "priority"), Cell(issue, "message"),
                    Cell(issue, "url"), rec, llm);
            }
        }

        return sb.ToString();
    }

    private static string CategoryDisplayName(string name) =>
        string.IsNullOrEmpty(name)
            ? ""
            : LegacyCategoryDisplay.TryGetValue(name, out var v) ? v : name;

    private static (string Display, string Llm) IssueRecommendation(JsonElement issue)
    {
        var rule = Cell(issue, "recommendation").Trim();
        var llm = Cell(issue, "llm_recommendation").Trim();
        if (llm.Length > 0 && llm != rule)
        {
            return (llm, llm);
        }
        return (llm.Length > 0 ? llm : rule, llm);
    }

    private static (string Summary, List<string> Priorities, string Source) Executive(JsonElement payload)
    {
        var summary = "";
        var source = "";
        var priorities = new List<string>();
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("executive_summary", out var es)
            && es.ValueKind == JsonValueKind.Object)
        {
            summary = Cell(es, "summary").Trim();
            source = Cell(es, "source").Trim();
            if (es.TryGetProperty("priorities", out var pr) && pr.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in pr.EnumerateArray())
                {
                    var s = (p.ValueKind == JsonValueKind.String ? p.GetString() ?? "" : p.GetRawText()).Trim();
                    if (s.Length > 0)
                    {
                        priorities.Add(s);
                    }
                }
            }
        }
        return (summary, priorities, source);
    }

    private static string ExecutiveSourceLabel(string source) => source switch
    {
        "ai_insights" => "AI insights",
        "deterministic" => "Measured + Search Console",
        _ => string.IsNullOrEmpty(source) ? "Audit data" : source,
    };

    private static IEnumerable<JsonElement> ArrayItems(JsonElement obj, string name)
    {
        if (obj.ValueKind == JsonValueKind.Object
            && obj.TryGetProperty(name, out var arr)
            && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                yield return item;
            }
        }
    }

    private static string Cell(JsonElement obj, string name)
    {
        if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(name, out var v))
        {
            return "";
        }
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString() ?? "",
            JsonValueKind.Number => v.GetRawText(),
            JsonValueKind.True => "True",
            JsonValueKind.False => "False",
            _ => "",
        };
    }

    private static void Row(StringBuilder sb, params string[] cells)
    {
        for (var i = 0; i < cells.Length; i++)
        {
            if (i > 0)
            {
                sb.Append(',');
            }
            sb.Append(CsvEscape(cells[i]));
        }
        sb.Append("\r\n");
    }

    private static string CsvEscape(string? s)
    {
        s ??= "";
        return s.IndexOfAny(CsvSpecial) >= 0
            ? "\"" + s.Replace("\"", "\"\"") + "\""
            : s;
    }
}
