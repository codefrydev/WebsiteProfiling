namespace ReportService.Application.Repositories;

/// <summary>
/// One crawled URL row (merged crawl_results.url + JSON data column).
/// </summary>
public sealed class CrawlRow
{
    public required string Url { get; init; }

    public string FetchMethod { get; init; } = "static";

    public string? Status { get; init; }

    public string? Title { get; init; }

    public string? FinalUrl { get; init; }

    public int? MetaDescriptionLen { get; init; }

    public int? H1Count { get; init; }

    public int? ContentLength { get; init; }

    public int? WordCount { get; init; }

    public int? Outlinks { get; init; }

    public double? CrawlTimeS { get; init; }

    public string? HeadingSequence { get; init; }

    public int? ScriptCount { get; init; }

    public int? LinkStylesheetCount { get; init; }

    public string? MetaDescription { get; init; }

    public string? H1 { get; init; }

    public string? OutlinkTargets { get; init; }

    public string? PageAnalysisJson { get; init; }

    public bool? Noindex { get; init; }

    public string? CanonicalUrl { get; init; }

    public bool? ViewportPresent { get; init; }

    public int? ResponseTimeMs { get; init; }

    public bool? HasSchema { get; init; }

    public int? ImagesTotal { get; init; }

    public int? ImagesWithoutAlt { get; init; }

    public double? ReadingLevel { get; init; }

    public int? RedirectChainLength { get; init; }

    public int? Depth { get; init; }

    public double? ContentHtmlRatio { get; init; }

    public string? ContentType { get; init; }

    public int? ImgWithoutLazy { get; init; }

    public int? ImgWithoutDimensions { get; init; }

    public int? AriaCount { get; init; }

    public int? MixedContentCount { get; init; }

    public string? CacheControl { get; init; }

    public string? Etag { get; init; }

    public string? StrictTransportSecurity { get; init; }

    public string? XContentTypeOptions { get; init; }

    public string? XFrameOptions { get; init; }

    public string? ContentSecurityPolicy { get; init; }

    public string? TopKeywords { get; init; }

    public string? ContentExcerpt { get; init; }

    public string? OgTitle { get; init; }

    public string? OgDescription { get; init; }

    public string? OgImage { get; init; }

    public string? OgType { get; init; }

    public string? TwitterCard { get; init; }

    public string? TwitterTitle { get; init; }

    public string? TwitterImage { get; init; }

    public string? TechStack { get; init; }

    public string? CustomExtract { get; init; }

    public string? CustomFields { get; init; }

    public string? HtmlLang { get; init; }
}
