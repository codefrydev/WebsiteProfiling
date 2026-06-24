using System.Text;
using System.Text.Json;

namespace FileService.Rendering.Exports;

/// <summary>
/// XML sitemap of indexable, 2xx URLs from the report payload's <c>links</c>. Faithful port of the
/// Python <c>build_sitemap_xml</c> (skips noindex + non-2xx, XML-escapes loc, caps at max_urls).
/// </summary>
public sealed class ReportSitemapExporter
{
    public string Generate(JsonElement payload, int maxUrls = 50000)
    {
        var urls = new List<string>();
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("links", out var links)
            && links.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in links.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }
                if (IsTruthy(row, "noindex"))
                {
                    continue;
                }
                var status = ScalarString(row, "status");
                if (!status.StartsWith("2", StringComparison.Ordinal))
                {
                    continue;
                }
                var url = ScalarString(row, "url").Trim();
                if (url.Length > 0)
                {
                    urls.Add(url);
                }
            }
        }

        var cap = Math.Max(1, maxUrls);
        if (urls.Count > cap)
        {
            urls = urls.GetRange(0, cap);
        }

        var body = string.Join(
            "\n",
            urls.Select(u => $"  <url><loc>{XmlEscape(u)}</loc></url>"));

        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        sb.Append(body).Append('\n');
        sb.Append("</urlset>\n");
        return sb.ToString();
    }

    // Mirrors xml.sax.saxutils.escape (default escapes only & < >, in that order).
    private static string XmlEscape(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    private static string ScalarString(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v))
        {
            return "";
        }
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString() ?? "",
            JsonValueKind.Number => v.GetRawText(),
            _ => "",
        };
    }

    private static bool IsTruthy(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v))
        {
            return false;
        }
        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String => !string.IsNullOrEmpty(v.GetString()),
            JsonValueKind.Number => v.TryGetDouble(out var d) && d != 0,
            JsonValueKind.Array => v.GetArrayLength() > 0,
            JsonValueKind.Object => v.EnumerateObject().Any(),
            _ => false,
        };
    }
}
