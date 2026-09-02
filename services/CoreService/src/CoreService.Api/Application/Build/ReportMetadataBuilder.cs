using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>
/// Port of Python reporting/report_metadata.py — provenance, crawl scope, fingerprints, hreflang.
/// </summary>
public static class ReportMetadataBuilder
{
    public static Dictionary<string, object?> BuildReportMetadata(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config,
        object? lighthouseSummary,
        IReadOnlyDictionary<string, object?>? googleData,
        IReadOnlyDictionary<string, object?>? keywordsData,
        IReadOnlyDictionary<string, object?>? mlBundle,
        long? crawlRunId,
        string? crawlRunCreatedAt,
        IReadOnlyDictionary<string, object?>? gscLinksData = null)
    {
        var sources = new List<string> { "crawl" };
        if (lighthouseSummary is not null)
        {
            sources.Add("lighthouse");
        }

        if (googleData is not null)
        {
            if (googleData.ContainsKey("gsc"))
            {
                sources.Add("search_console");
            }

            if (googleData.ContainsKey("ga4"))
            {
                sources.Add("analytics");
            }
        }

        if (gscLinksData is not null && !sources.Contains("search_console"))
        {
            sources.Add("search_console");
        }

        if (mlBundle?.TryGetValue("llm_meta", out var llmMetaObj) == true
            && llmMetaObj is IReadOnlyDictionary<string, object?> llmMeta
            && llmMeta.TryGetValue("model", out var model)
            && model is not null
            && !string.IsNullOrWhiteSpace(model.ToString()))
        {
            sources.Add("ai");
        }

        var kwRows = ExtractKeywordRows(keywordsData);
        var hasGscKw = kwRows.Any(r =>
            r.TryGetValue("source", out var src)
            && (src?.ToString() is "gsc" or "site+gsc" or null)
            && ((r.TryGetValue("gsc_impressions", out var imp) && HasPositive(imp))
                || (r.TryGetValue("gsc_clicks", out var clk) && HasPositive(clk))));
        if (kwRows.Count > 0 && !hasGscKw && !sources.Contains("estimated"))
        {
            sources.Add("estimated");
        }

        var maxPagesCfg = ParseInt(config, "max_pages", 0);
        var pagesCrawled = rows.Count;
        var blocked = rows.Count(r => string.Equals(r.Status, "blocked_by_robots", StringComparison.Ordinal));
        var renderMode = (config?.GetValueOrDefault("crawl_render_mode") ?? "static").Trim().ToLowerInvariant();
        var jsConcurrency = ParseInt(config, "crawl_js_concurrency", 3);
        var staticHtmlOnly = renderMode == "static";

        var crawlScope = new Dictionary<string, object?>
        {
            ["pages_crawled"] = pagesCrawled,
            ["max_pages_configured"] = maxPagesCfg > 0 ? maxPagesCfg : pagesCrawled,
            ["robots_blocked_count"] = blocked,
            ["static_html_only"] = staticHtmlOnly,
            ["render_mode"] = renderMode,
            ["js_concurrency"] = staticHtmlOnly ? null : jsConcurrency,
            ["crawl_limited"] = maxPagesCfg > 0 && pagesCrawled >= maxPagesCfg,
        };

        var pagesStatic = rows.Count(r => string.Equals(r.FetchMethod, "static", StringComparison.OrdinalIgnoreCase));
        var pagesRendered = rows.Count(r => string.Equals(r.FetchMethod, "rendered", StringComparison.OrdinalIgnoreCase));
        if (renderMode == "auto" || pagesRendered > 0)
        {
            crawlScope["pages_static"] = pagesStatic;
            crawlScope["pages_rendered"] = pagesRendered;
        }

        var browserAgg = BrowserDiagnosticsAggregator.Aggregate(rows);
        if (browserAgg is not null
            && (renderMode != "static"
                || (browserAgg.TryGetValue("total_console_errors", out var tceObj)
                    && Convert.ToInt32(tceObj) > 0)))
        {
            crawlScope["browser_diagnostics"] = browserAgg;
        }

        var meta = new Dictionary<string, object?>
        {
            ["data_sources"] = sources,
            ["generated_at"] = DateTimeOffset.UtcNow.ToString("O"),
            ["crawl_scope"] = crawlScope,
        };

        if (crawlRunId is not null)
        {
            meta["crawl_run_id"] = crawlRunId.Value;
        }

        if (!string.IsNullOrWhiteSpace(crawlRunCreatedAt))
        {
            meta["crawl_run_created_at"] = crawlRunCreatedAt;
        }

        if (googleData is not null)
        {
            if (googleData.TryGetValue("fetched_at", out var fetchedAt))
            {
                meta["google_fetched_at"] = fetchedAt;
            }

            if (googleData.TryGetValue("date_range_days", out var days))
            {
                meta["google_date_range_days"] = days;
            }

            if (googleData.TryGetValue("gsc", out var gscObj)
                && gscObj is IReadOnlyDictionary<string, object?> gsc
                && gsc.TryGetValue("row_count", out var rowCount))
            {
                meta["gsc_row_count"] = rowCount;
            }
        }

        if (keywordsData is not null)
        {
            meta["keywords_enriched_at"] = keywordsData.GetValueOrDefault("enriched_at")
                ?? keywordsData.GetValueOrDefault("fetched_at");
        }

        if (gscLinksData is not null)
        {
            meta["gsc_links_imported_at"] = gscLinksData.GetValueOrDefault("imported_at");
            meta["gsc_links_referring_domains"] = CountList(gscLinksData, "top_linking_sites");
            meta["gsc_links_sample_count"] = CountList(gscLinksData, "sample_links")
                + CountList(gscLinksData, "latest_links");
        }

        if (mlBundle?.TryGetValue("llm_meta", out var llm) == true && llm is not null)
        {
            meta["llm"] = llm;
        }

        var logoUrl = (config?.GetValueOrDefault("export_logo_url") ?? "").Trim();
        if (!string.IsNullOrEmpty(logoUrl))
        {
            meta["export_logo_url"] = logoUrl;
        }

        return meta;
    }

    public static List<Dictionary<string, object?>> BuildUrlFingerprints(IReadOnlyList<CrawlRow> rows)
    {
        var outList = new List<Dictionary<string, object?>>();
        foreach (var row in rows)
        {
            var url = row.Url.Trim();
            if (string.IsNullOrEmpty(url))
            {
                continue;
            }

            var title = row.Title ?? "";
            var meta = row.MetaDescription ?? "";
            var h1 = row.H1 ?? "";
            var headings = row.HeadingSequence ?? "";
            var wc = row.WordCount ?? 0;
            var cl = row.ContentLength ?? 0;
            var h1c = row.H1Count ?? 0;
            var sc = row.ScriptCount ?? 0;
            var lc = row.LinkStylesheetCount ?? 0;

            var rawC = string.Join("|", title, meta, h1, wc.ToString(), cl.ToString());
            var contentFp = Sha256Hex(rawC);
            var rawS = string.Join("|", cl.ToString(), sc.ToString(), lc.ToString(), h1c.ToString(), headings);
            var structureFp = Sha256Hex(rawS);

            outList.Add(new Dictionary<string, object?>
            {
                ["url"] = url,
                ["content_fingerprint"] = contentFp,
                ["structure_fingerprint"] = structureFp,
            });
        }

        return outList;
    }

    public static Dictionary<string, object?> BuildHreflangSummary(IReadOnlyList<CrawlRow> rows)
    {
        var total = 0;
        var missingLang = 0;
        var withHreflang = 0;

        foreach (var row in rows)
        {
            var st = (row.Status ?? "").Trim();
            if (!st.StartsWith('2'))
            {
                continue;
            }

            total++;
            var pa = CategoryHelpers.ParsePageAnalysis(row.PageAnalysisJson);
            if (string.IsNullOrWhiteSpace(pa.GetValueOrDefault("html_lang")?.ToString()))
            {
                missingLang++;
            }

            if (pa.ContainsKey("hreflang_alternates") && pa["hreflang_alternates"] is not null)
            {
                withHreflang++;
            }
        }

        return new Dictionary<string, object?>
        {
            ["pages_200"] = total,
            ["pages_missing_html_lang"] = missingLang,
            ["pages_with_hreflang_links"] = withHreflang,
        };
    }

    public static List<Dictionary<string, object?>> BuildOutboundLinkDomains(
        IReadOnlyList<CrawlRow> rows,
        string startUrl,
        int maxRows)
    {
        var siteHost = UrlHost(startUrl);
        var hostPages = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var hostLinkCount = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            var st = (row.Status ?? "").Trim();
            if (st.StartsWith('4') || st.StartsWith('5'))
            {
                continue;
            }

            var u = row.Url.Trim();
            if (string.IsNullOrEmpty(u))
            {
                continue;
            }

            var seenOnPage = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var pa = CategoryHelpers.ParsePageAnalysis(row.PageAnalysisJson);
            foreach (var link in EnumerateExternalLinks(pa.GetValueOrDefault("external_links")))
            {
                TrackOutbound(link, siteHost, u, hostPages, hostLinkCount, seenOnPage, alwaysCount: true);
            }

            if (!string.IsNullOrWhiteSpace(row.OutlinkTargets))
            {
                foreach (var link in EdgesBuilder.ParseLinksSerialized(row.OutlinkTargets))
                {
                    TrackOutbound(link, siteHost, u, hostPages, hostLinkCount, seenOnPage, alwaysCount: false);
                }
            }
        }

        return hostPages
            .Select(kv => new Dictionary<string, object?>
            {
                ["host"] = kv.Key,
                ["page_count"] = kv.Value.Count,
                ["link_count"] = hostLinkCount.GetValueOrDefault(kv.Key),
            })
            .OrderByDescending(r => (int)(r["link_count"] ?? 0))
            .ThenByDescending(r => (int)(r["page_count"] ?? 0))
            .ThenBy(r => (string?)r["host"], StringComparer.OrdinalIgnoreCase)
            .Take(maxRows)
            .ToList();
    }

    private static IEnumerable<string> EnumerateExternalLinks(object? extObj)
    {
        if (extObj is JsonElement el && el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var link = item.GetString();
                    if (!string.IsNullOrWhiteSpace(link))
                    {
                        yield return link;
                    }
                }
            }

            yield break;
        }

        if (extObj is IEnumerable<object?> list)
        {
            foreach (var linkObj in list)
            {
                if (linkObj?.ToString() is { Length: > 0 } link)
                {
                    yield return link;
                }
            }
        }
    }

    private static void TrackOutbound(
        string link,
        string siteHost,
        string pageUrl,
        Dictionary<string, HashSet<string>> hostPages,
        Dictionary<string, int> hostLinkCount,
        HashSet<string> seenOnPage,
        bool alwaysCount)
    {
        var h = UrlHost(link);
        if (string.IsNullOrEmpty(h) || string.Equals(h, siteHost, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        hostPages.TryAdd(h, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        hostPages[h].Add(pageUrl);
        if (alwaysCount || !seenOnPage.Contains(link))
        {
            hostLinkCount[h] = hostLinkCount.GetValueOrDefault(h) + 1;
        }

        seenOnPage.Add(link);
    }

    private static string UrlHost(string url)
    {
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return "";
        }

        return uri.Host.ToLowerInvariant();
    }

    private static string Sha256Hex(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static int ParseInt(IReadOnlyDictionary<string, string>? config, string key, int defaultValue)
    {
        if (config is null || !config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return int.TryParse(raw, out var parsed) ? parsed : defaultValue;
    }

    private static bool HasPositive(object? value) =>
        value switch
        {
            int i => i > 0,
            long l => l > 0,
            double d => d > 0,
            string s when int.TryParse(s, out var parsed) => parsed > 0,
            _ => false,
        };

    private static List<IReadOnlyDictionary<string, object?>> ExtractKeywordRows(
        IReadOnlyDictionary<string, object?>? keywordsData)
    {
        if (keywordsData?.TryGetValue("rows", out var rowsObj) != true || rowsObj is not IEnumerable<object?> rows)
        {
            return [];
        }

        var list = new List<IReadOnlyDictionary<string, object?>>();
        foreach (var row in rows.Take(500))
        {
            if (row is IReadOnlyDictionary<string, object?> dict)
            {
                list.Add(dict);
            }
        }

        return list;
    }

    private static int CountList(IReadOnlyDictionary<string, object?> data, string key) =>
        data.TryGetValue(key, out var obj) && obj is IEnumerable<object?> list ? list.Count() : 0;
}
