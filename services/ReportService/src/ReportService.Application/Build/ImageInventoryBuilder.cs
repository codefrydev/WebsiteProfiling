using System.Text.Json;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Aggregate image inventory from crawl row JSONB (page_analysis + social images).</summary>
public static class ImageInventoryBuilder
{
    public static (List<Dictionary<string, object?>> Inventory, Dictionary<string, object?> Summary) Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config = null)
    {
        var unoptimizedMinKb = ParseInt(config, "image_unoptimized_min_kb", 200);
        var summary = new Dictionary<string, object?>
        {
            ["probed"] = 0,
            ["failed"] = 0,
            ["total_bytes"] = 0,
            ["over_threshold_count"] = 0,
            ["unoptimized_min_kb"] = unoptimizedMinKb,
            ["inventory_available"] = false,
        };

        var refs = CollectImageRefs(rows);
        if (refs.Count == 0)
        {
            return ([], summary);
        }

        var inventory = refs
            .OrderBy(kvp => kvp.Key, StringComparer.Ordinal)
            .Select(kvp => new Dictionary<string, object?>
            {
                ["url"] = kvp.Key,
                ["status"] = null,
                ["content_type"] = null,
                ["size_bytes"] = null,
                ["error"] = null,
                ["source_pages"] = kvp.Value.SourcePages.OrderBy(u => u, StringComparer.Ordinal).ToList(),
                ["kinds"] = kvp.Value.Kinds.OrderBy(k => k, StringComparer.Ordinal).ToList(),
            })
            .ToList();

        summary["inventory_available"] = true;
        return (inventory, summary);
    }

    internal static Dictionary<string, ImageRefMeta> CollectImageRefs(IReadOnlyList<CrawlRow> rows)
    {
        var refs = new Dictionary<string, ImageRefMeta>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var pageUrl = row.Url.Trim();
            if (string.IsNullOrEmpty(pageUrl))
            {
                continue;
            }

            var pa = ContactIntelligenceBuilder.ParsePageAnalysis(row.PageAnalysisJson);
            if (pa.TryGetValue("image_urls", out var imageUrlsObj))
            {
                foreach (var imageUrl in ExtractStringList(imageUrlsObj))
                {
                    AddRef(refs, imageUrl, pageUrl, "content");
                }
            }

            AddRef(refs, row.OgImage, pageUrl, "og");
            AddRef(refs, row.TwitterImage, pageUrl, "twitter");
        }

        return refs;
    }

    private static void AddRef(
        Dictionary<string, ImageRefMeta> refs,
        string? raw,
        string pageUrl,
        string kind)
    {
        var norm = NormalizeImageUrl(raw);
        if (norm is null || string.IsNullOrEmpty(pageUrl))
        {
            return;
        }

        if (!refs.TryGetValue(norm, out var meta))
        {
            meta = new ImageRefMeta();
            refs[norm] = meta;
        }

        meta.SourcePages.Add(pageUrl);
        meta.Kinds.Add(kind);
    }

    internal static string? NormalizeImageUrl(string? raw)
    {
        var value = (raw ?? "").Trim();
        if (string.IsNullOrEmpty(value) || value.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || uri.Scheme is not ("http" or "https"))
        {
            return null;
        }

        var withoutFragment = value.Split('#')[0];
        return withoutFragment;
    }

    private static IEnumerable<string> ExtractStringList(object? value)
    {
        switch (value)
        {
            case JsonElement { ValueKind: JsonValueKind.Array } arr:
                return arr.EnumerateArray()
                    .Select(item => item.GetString()?.Trim() ?? "")
                    .Where(s => s.Length > 0)
                    .ToList();
            case string s when !string.IsNullOrWhiteSpace(s):
                try
                {
                    using var doc = JsonDocument.Parse(s);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        return doc.RootElement.EnumerateArray()
                            .Select(item => item.GetString()?.Trim() ?? "")
                            .Where(itemStr => itemStr.Length > 0)
                            .ToList();
                    }

                    if (doc.RootElement.ValueKind == JsonValueKind.String)
                    {
                        var one = doc.RootElement.GetString()?.Trim();
                        return string.IsNullOrEmpty(one) ? [] : [one];
                    }
                }
                catch (JsonException)
                {
                    return [s.Trim()];
                }

                return [s.Trim()];
            default:
                return [];
        }
    }

    private static int ParseInt(IReadOnlyDictionary<string, string>? config, string key, int defaultValue)
    {
        if (config is null || !config.TryGetValue(key, out var raw) || !int.TryParse(raw.Trim(), out var n))
        {
            return defaultValue;
        }

        return n;
    }

    internal sealed class ImageRefMeta
    {
        public HashSet<string> SourcePages { get; } = new(StringComparer.Ordinal);

        public HashSet<string> Kinds { get; } = new(StringComparer.Ordinal);
    }
}
