using System.Text.Json;
using System.Text.Json.Nodes;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/builder_sections/links.build_links_list.</summary>
public static class LinksListBuilder
{
    public static Dictionary<string, int> BuildInDegree(IReadOnlyList<(string From, string To)> edges)
    {
        var inDegree = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (_, tgt) in edges)
        {
            inDegree[tgt] = inDegree.GetValueOrDefault(tgt) + 1;
        }

        return inDegree;
    }

    public static List<Dictionary<string, object?>> BuildLinksList(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, int> inDegree,
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl,
        IReadOnlyDictionary<string, object?>? mlBundle)
    {
        mlBundle ??= new Dictionary<string, object?>();
        lighthouseByUrl ??= new Dictionary<string, JsonNode>();

        var dupGid = MlBundleMaps.UrlObjectMap(mlBundle, "url_duplicate_group_id");
        var simMap = MlBundleMaps.UrlListMap(mlBundle, "similar_internal_by_url");
        var langMap = MlBundleMaps.UrlStringMap(mlBundle, "language_by_url");
        var spacyMap = MlBundleMaps.UrlObjectMap(mlBundle, "spacy_by_url");
        var kpMap = MlBundleMaps.UrlListMap(mlBundle, "keyphrases_by_url");

        var links = new List<Dictionary<string, object?>>();
        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Url))
            {
                continue;
            }

            var url = row.Url.Trim();
            var urlKey = url.TrimEnd('/');
            var pageAnalysis = MaterializePageAnalysis(row.PageAnalysisJson);
            var browser = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pageAnalysis);

            var rec = new Dictionary<string, object?>
            {
                ["url"] = url,
                ["status"] = (row.Status ?? "").Trim(),
                ["inlinks"] = inDegree.GetValueOrDefault(url, inDegree.GetValueOrDefault(urlKey, 0)),
                ["title"] = (row.Title ?? "").Trim(),
                ["content_length"] = row.ContentLength ?? 0,
                ["word_count"] = row.WordCount ?? 0,
                ["response_time_ms"] = row.ResponseTimeMs ?? 0,
                ["outlinks"] = row.Outlinks ?? 0,
                ["content_type"] = row.ContentType ?? "",
                ["redirect_chain_length"] = row.RedirectChainLength ?? 0,
                ["meta_description"] = row.MetaDescription ?? "",
                ["meta_description_len"] = row.MetaDescriptionLen ?? 0,
                ["h1"] = row.H1 ?? "",
                ["h1_count"] = row.H1Count ?? (string.IsNullOrWhiteSpace(row.H1) ? 0 : 1),
                ["canonical_url"] = row.CanonicalUrl ?? "",
                ["noindex"] = row.Noindex ?? false,
                ["has_schema"] = row.HasSchema ?? false,
                ["viewport_present"] = row.ViewportPresent ?? false,
                ["heading_sequence"] = row.HeadingSequence ?? "",
                ["images_total"] = row.ImagesTotal ?? 0,
                ["images_without_alt"] = row.ImagesWithoutAlt ?? 0,
                ["img_without_lazy"] = row.ImgWithoutLazy ?? 0,
                ["img_without_dimensions"] = row.ImgWithoutDimensions ?? 0,
                ["aria_count"] = row.AriaCount ?? 0,
                ["mixed_content_count"] = row.MixedContentCount ?? 0,
                ["script_count"] = row.ScriptCount ?? 0,
                ["link_stylesheet_count"] = row.LinkStylesheetCount ?? 0,
                ["cache_control"] = row.CacheControl ?? "",
                ["etag"] = row.Etag ?? "",
                ["strict_transport_security"] = row.StrictTransportSecurity ?? "",
                ["x_content_type_options"] = row.XContentTypeOptions ?? "",
                ["x_frame_options"] = row.XFrameOptions ?? "",
                ["content_security_policy"] = row.ContentSecurityPolicy ?? "",
                ["reading_level"] = Math.Round(row.ReadingLevel ?? 0, 1),
                ["content_html_ratio"] = Math.Round(row.ContentHtmlRatio ?? 0, 2),
                ["top_keywords"] = row.TopKeywords ?? "",
                ["content_excerpt"] = row.ContentExcerpt ?? "",
                ["og_title"] = row.OgTitle ?? "",
                ["og_description"] = row.OgDescription ?? "",
                ["og_image"] = row.OgImage ?? "",
                ["og_type"] = row.OgType ?? "",
                ["twitter_card"] = row.TwitterCard ?? "",
                ["twitter_title"] = row.TwitterTitle ?? "",
                ["twitter_image"] = row.TwitterImage ?? "",
                ["tech_stack"] = row.TechStack ?? "",
                ["custom_extract"] = row.CustomExtract ?? "",
                ["custom_fields"] = row.CustomFields ?? "",
                ["page_analysis"] = pageAnalysis,
                ["internal_link_count"] = ToInt(pageAnalysis.GetValueOrDefault("internal_link_count")),
                ["external_link_count"] = ToInt(pageAnalysis.GetValueOrDefault("external_link_count")),
                ["console_error_count"] = browser.ConsoleErrorCount,
                ["page_error_count"] = browser.PageErrorCount,
                ["has_browser_errors"] = browser.ConsoleErrorCount > 0 || browser.PageErrorCount > 0,
                ["lighthouse"] = SerializeLighthouse(LighthouseReportMerge.LighthouseForUrl(lighthouseByUrl, url)),
            };

            if (row.Depth.HasValue)
            {
                rec["depth"] = row.Depth.Value;
            }

            ApplyMlOverlays(rec, pageAnalysis, url, urlKey, dupGid, simMap, langMap, spacyMap, kpMap);
            links.Add(rec);
        }

        return links;
    }

    public static List<string> BuildOrphanUrls(IReadOnlyList<Dictionary<string, object?>> links) =>
        links
            .Where(rec => ToInt(rec.GetValueOrDefault("inlinks")) == 0)
            .Select(rec => rec.GetValueOrDefault("url")?.ToString() ?? "")
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .ToList();

    private static Dictionary<string, object?> MaterializePageAnalysis(string? raw)
    {
        var parsed = CategoryHelpers.ParsePageAnalysisCell(raw);
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, val) in parsed)
        {
            if (val is string s && (s.StartsWith('{') || s.StartsWith('[')))
            {
                try
                {
                    using var doc = JsonDocument.Parse(s);
                    result[key] = doc.RootElement.ValueKind switch
                    {
                        JsonValueKind.Object => JsonSerializer.Deserialize<Dictionary<string, object?>>(s) ?? new Dictionary<string, object?>(),
                        JsonValueKind.Array => JsonSerializer.Deserialize<List<object?>>(s) ?? [],
                        _ => s,
                    };
                    continue;
                }
                catch (JsonException)
                {
                    // keep string
                }
            }

            result[key] = val;
        }

        return result;
    }

    private static void ApplyMlOverlays(
        Dictionary<string, object?> rec,
        Dictionary<string, object?> pageAnalysis,
        string url,
        string urlKey,
        IReadOnlyDictionary<string, object?> dupGid,
        IReadOnlyDictionary<string, List<object?>> simMap,
        IReadOnlyDictionary<string, string> langMap,
        IReadOnlyDictionary<string, object?> spacyMap,
        IReadOnlyDictionary<string, List<object?>> kpMap)
    {
        if (langMap.TryGetValue(urlKey, out var lang) || langMap.TryGetValue(url, out lang))
        {
            EnsureSignals(pageAnalysis)["language"] = lang;
            rec["detected_language"] = lang;
        }

        if (spacyMap.TryGetValue(urlKey, out var spacy) || spacyMap.TryGetValue(url, out spacy))
        {
            EnsureSignals(pageAnalysis)["nlp_entities"] = spacy;
            rec["nlp_entities"] = spacy;
        }

        if (dupGid.TryGetValue(urlKey, out var gid) || dupGid.TryGetValue(url, out gid))
        {
            rec["duplicate_group_id"] = UnwrapJsonValue(gid);
        }

        if (simMap.TryGetValue(urlKey, out var similar) || simMap.TryGetValue(url, out similar))
        {
            rec["similar_internal"] = similar;
        }

        if (kpMap.TryGetValue(urlKey, out var kp) || kpMap.TryGetValue(url, out kp))
        {
            rec["keyphrases"] = kp;
        }

        rec["page_analysis"] = pageAnalysis;
    }

    private static Dictionary<string, object?> EnsureSignals(Dictionary<string, object?> pageAnalysis)
    {
        if (!pageAnalysis.TryGetValue("signals", out var signalsObj)
            || signalsObj is not Dictionary<string, object?> signals)
        {
            signals = new Dictionary<string, object?>();
            pageAnalysis["signals"] = signals;
        }

        return signals;
    }

    private static object? UnwrapJsonValue(object? value) =>
        value switch
        {
            JsonElement { ValueKind: JsonValueKind.Number } el when el.TryGetInt32(out var n) => n,
            JsonElement { ValueKind: JsonValueKind.String } el => el.GetString(),
            JsonElement { ValueKind: JsonValueKind.True } => true,
            JsonElement { ValueKind: JsonValueKind.False } => false,
            JsonElement el => JsonSerializer.Deserialize<object>(el.GetRawText()),
            _ => value,
        };

    private static object? SerializeLighthouse(JsonNode? node) =>
        node is null ? null : JsonSerializer.Deserialize<object>(node.ToJsonString());

    private static int ToInt(object? value) =>
        value switch
        {
            int i => i,
            long l => (int)l,
            double d => (int)d,
            JsonElement el when el.TryGetInt32(out var n) => n,
            string s when int.TryParse(s, out var parsed) => parsed,
            _ => 0,
        };
}
