using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class CrawlSetting
{
    public long Id { get; set; }

    public string StartUrl { get; set; } = null!;

    public string CrawlDiscoveryMode { get; set; } = null!;

    public string CrawlUrlList { get; set; } = null!;

    public string CrawlUserAgentPreset { get; set; } = null!;

    public string CrawlUserAgentCustom { get; set; } = null!;

    public string CompareMobileDesktop { get; set; } = null!;

    public string CrawlAuthUsername { get; set; } = null!;

    public string CrawlExtraHeaders { get; set; } = null!;

    public string CrawlRobotsTxtOverride { get; set; } = null!;

    public string CustomExtractors { get; set; } = null!;

    public string MainContentSelectors { get; set; } = null!;

    public string BoilerplateSelectors { get; set; } = null!;

    public string PipelineGraphJson { get; set; } = null!;

    public string MaxPages { get; set; } = null!;

    public string Concurrency { get; set; } = null!;

    public string Timeout { get; set; } = null!;

    public string MaxDepth { get; set; } = null!;

    public string PoliteDelay { get; set; } = null!;

    public string IgnoreRobots { get; set; } = null!;

    public string AllowExternal { get; set; } = null!;

    public string StoreOutlinks { get; set; } = null!;

    public string StoreContentExcerpt { get; set; } = null!;

    public string ContentExcerptMaxChars { get; set; } = null!;

    public string StorePageHtml { get; set; } = null!;

    public string MaxStoredHtmlBytes { get; set; } = null!;

    public string RunContentAnalysis { get; set; } = null!;

    public string ContentAnalysisStrategy { get; set; } = null!;

    public string ContentAnalysisWorkers { get; set; } = null!;

    public string CustomExtractionRegex { get; set; } = null!;

    public string CrawlPathSegments { get; set; } = null!;

    public string CrawlIgnoreParams { get; set; } = null!;

    public string CompetitorDomains { get; set; } = null!;

    public string ExportLogoUrl { get; set; } = null!;

    public string PreserveCrawlHistory { get; set; } = null!;

    public string CrawlStreamToDb { get; set; } = null!;

    public string CrawlExcludeUrls { get; set; } = null!;

    public string CrawlRenderMode { get; set; } = null!;

    public string CrawlJsConcurrency { get; set; } = null!;

    public string CrawlJsTimeout { get; set; } = null!;

    public string CrawlJsWaitUntil { get; set; } = null!;

    public string CrawlJsExtraWaitMs { get; set; } = null!;

    public string CrawlJsBlockResources { get; set; } = null!;

    public string CrawlJsCaptureConsole { get; set; } = null!;

    public string CrawlJsConsoleLevels { get; set; } = null!;

    public string CrawlJsCaptureFailedRequests { get; set; } = null!;

    public string CrawlJsConsoleMaxPerPage { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
