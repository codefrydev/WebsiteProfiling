using System.Text.Json;
using ReportService.Domain.Entities;

namespace ReportService.Application.Repositories;

internal static class CrawlRowMapper
{
    public static CrawlRow FromEntity(CrawlResult entity)
    {
        var url = entity.Url.Trim();
        var fetchMethod = string.IsNullOrWhiteSpace(entity.FetchMethod) ? "static" : entity.FetchMethod.Trim();
        return MergeRow(url, fetchMethod, entity.Data, entity.Status);
    }

    public static CrawlRow MergeRow(string url, string fetchMethod, string dataJson, string? columnStatus = null)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(dataJson) ? "{}" : dataJson);
        var root = doc.RootElement;
        return new CrawlRow
        {
            Url = url,
            FetchMethod = string.IsNullOrWhiteSpace(fetchMethod) ? "static" : fetchMethod.Trim(),
            Status = GetStatusString(root) ?? NormalizeStatus(columnStatus),
            Title = GetString(root, "title"),
            FinalUrl = GetString(root, "final_url"),
            MetaDescriptionLen = GetInt(root, "meta_description_len"),
            H1Count = GetInt(root, "h1_count"),
            ContentLength = GetInt(root, "content_length"),
            WordCount = GetInt(root, "word_count"),
            Outlinks = GetInt(root, "outlinks"),
            CrawlTimeS = GetDouble(root, "crawl_time_s"),
            HeadingSequence = GetString(root, "heading_sequence"),
            ScriptCount = GetInt(root, "script_count"),
            LinkStylesheetCount = GetInt(root, "link_stylesheet_count"),
            MetaDescription = GetString(root, "meta_description"),
            H1 = GetString(root, "h1"),
            OutlinkTargets = GetString(root, "outlink_targets"),
            PageAnalysisJson = root.TryGetProperty("page_analysis", out var pa) && pa.ValueKind == JsonValueKind.String
                ? pa.GetString()
                : root.TryGetProperty("page_analysis", out var paObj) && paObj.ValueKind == JsonValueKind.Object
                    ? paObj.GetRawText()
                    : null,
            Noindex = GetBool(root, "noindex"),
            CanonicalUrl = GetString(root, "canonical_url"),
            ViewportPresent = GetBool(root, "viewport_present"),
            ViewportContent = GetString(root, "viewport_content"),
            ResponseTimeMs = GetInt(root, "response_time_ms"),
            HasSchema = GetBool(root, "has_schema"),
            ImagesTotal = GetInt(root, "images_total"),
            ImagesWithoutAlt = GetInt(root, "images_without_alt"),
            ReadingLevel = GetDouble(root, "reading_level"),
            RedirectChainLength = GetInt(root, "redirect_chain_length"),
            Depth = GetInt(root, "depth"),
            ContentHtmlRatio = GetDouble(root, "content_html_ratio"),
            ContentType = GetString(root, "content_type"),
            ImgWithoutLazy = GetInt(root, "img_without_lazy"),
            ImgWithoutDimensions = GetInt(root, "img_without_dimensions"),
            AriaCount = GetInt(root, "aria_count"),
            MixedContentCount = GetInt(root, "mixed_content_count"),
            CacheControl = GetString(root, "cache_control"),
            Etag = GetString(root, "etag"),
            StrictTransportSecurity = GetString(root, "strict_transport_security"),
            XContentTypeOptions = GetString(root, "x_content_type_options"),
            XFrameOptions = GetString(root, "x_frame_options"),
            ContentSecurityPolicy = GetString(root, "content_security_policy"),
            TopKeywords = GetString(root, "top_keywords"),
            ContentExcerpt = GetString(root, "content_excerpt"),
            OgTitle = GetString(root, "og_title"),
            OgDescription = GetString(root, "og_description"),
            OgImage = GetString(root, "og_image"),
            OgType = GetString(root, "og_type"),
            TwitterCard = GetString(root, "twitter_card"),
            TwitterTitle = GetString(root, "twitter_title"),
            TwitterImage = GetString(root, "twitter_image"),
            TechStack = GetString(root, "tech_stack"),
            CustomExtract = GetString(root, "custom_extract"),
            CustomFields = GetString(root, "custom_fields"),
            HtmlLang = GetString(root, "html_lang"),
        };
    }

    private static string? GetString(JsonElement root, string name) =>
        root.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static string? GetStatusString(JsonElement root)
    {
        if (TryGetStatusFromProperty(root, "status", out var status))
        {
            return status;
        }

        if (TryGetStatusFromProperty(root, "status_code", out status))
        {
            return status;
        }

        return null;
    }

    private static bool TryGetStatusFromProperty(JsonElement root, string name, out string? status)
    {
        status = null;
        if (!root.TryGetProperty(name, out var el))
        {
            return false;
        }

        status = el.ValueKind switch
        {
            JsonValueKind.String => el.GetString()?.Trim(),
            JsonValueKind.Number when el.TryGetInt64(out var n) => n.ToString(System.Globalization.CultureInfo.InvariantCulture),
            JsonValueKind.Number => ((long)el.GetDouble()).ToString(System.Globalization.CultureInfo.InvariantCulture),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };

        return !string.IsNullOrWhiteSpace(status);
    }

    private static string? NormalizeStatus(string? status)
    {
        var trimmed = status?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static int? GetInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el))
        {
            return null;
        }

        return el.ValueKind switch
        {
            JsonValueKind.Number when el.TryGetInt32(out var i) => i,
            JsonValueKind.String when int.TryParse(el.GetString(), out var parsed) => parsed,
            _ => null,
        };
    }

    private static double? GetDouble(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el))
        {
            return null;
        }

        return el.ValueKind switch
        {
            JsonValueKind.Number when el.TryGetDouble(out var d) => d,
            JsonValueKind.String when double.TryParse(el.GetString(), out var parsed) => parsed,
            _ => null,
        };
    }

    private static bool? GetBool(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el))
        {
            return null;
        }

        return el.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(el.GetString(), out var b) => b,
            JsonValueKind.String when el.GetString() is "1" or "yes" => true,
            JsonValueKind.String when el.GetString() is "0" or "no" => false,
            JsonValueKind.Number when el.TryGetInt32(out var i) => i != 0,
            _ => null,
        };
    }
}
