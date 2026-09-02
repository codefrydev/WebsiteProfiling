using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace CoreService.Api.DataApplication.Dto.Portfolio;

public sealed class PortfolioIssueCountsDto
{
    [JsonPropertyName("critical")] public int Critical { get; set; }
    [JsonPropertyName("high")] public int High { get; set; }
    [JsonPropertyName("medium")] public int Medium { get; set; }
    [JsonPropertyName("low")] public int Low { get; set; }
}

public sealed class PortfolioStatusCountsDto
{
    [JsonPropertyName("s2xx")] public int S2xx { get; set; }
    [JsonPropertyName("s3xx")] public int S3xx { get; set; }
    [JsonPropertyName("s4xx")] public int S4xx { get; set; }
    [JsonPropertyName("s5xx")] public int S5xx { get; set; }
    [JsonPropertyName("other")] public int Other { get; set; }
}

public sealed class PortfolioCategorySnapshotDto
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("score")] public int Score { get; set; }
    [JsonPropertyName("issueCount")] public int IssueCount { get; set; }
}

public sealed class PortfolioSeoSignalsDto
{
    [JsonPropertyName("missingTitles")] public int MissingTitles { get; set; }
    [JsonPropertyName("missingMetaDesc")] public int MissingMetaDesc { get; set; }
    [JsonPropertyName("thinContent")] public int ThinContent { get; set; }
    [JsonPropertyName("h1Issues")] public int H1Issues { get; set; }
}

public sealed class PortfolioGroupDto
{
    [JsonPropertyName("domainName")] public string DomainName { get; set; } = "";
    [JsonPropertyName("crawlUrl")] public string CrawlUrl { get; set; } = "";
    [JsonPropertyName("urlCount")] public int UrlCount { get; set; }
    [JsonPropertyName("healthScore")] public int HealthScore { get; set; }
    [JsonPropertyName("statusCounts")] public PortfolioStatusCountsDto StatusCounts { get; set; } = new();
    [JsonPropertyName("lastCrawl")] public string LastCrawl { get; set; } = "";
    [JsonPropertyName("lastAudit")] public string LastAudit { get; set; } = "";
    [JsonPropertyName("totalIssues")] public int TotalIssues { get; set; }
    [JsonPropertyName("issueCounts")] public PortfolioIssueCountsDto IssueCounts { get; set; } = new();
    [JsonPropertyName("successRate")] public int? SuccessRate { get; set; }
    [JsonPropertyName("titleCoverage")] public int? TitleCoverage { get; set; }
    [JsonPropertyName("avgWordCount")] public int? AvgWordCount { get; set; }
    [JsonPropertyName("thinPages")] public int? ThinPages { get; set; }
    [JsonPropertyName("technicalSeoScore")] public int? TechnicalSeoScore { get; set; }
    [JsonPropertyName("perfScore")] public int? PerfScore { get; set; }
    [JsonPropertyName("seoScore")] public int? SeoScore { get; set; }
    [JsonPropertyName("crawlDurationS")] public int? CrawlDurationS { get; set; }
    [JsonPropertyName("categorySnapshots")] public IReadOnlyList<PortfolioCategorySnapshotDto> CategorySnapshots { get; set; } = [];
    [JsonPropertyName("seoSignals")] public PortfolioSeoSignalsDto? SeoSignals { get; set; }
    [JsonPropertyName("securityFindings")] public int SecurityFindings { get; set; }
    [JsonPropertyName("duplicateClusters")] public int DuplicateClusters { get; set; }
    [JsonPropertyName("medianWordCount")] public int? MedianWordCount { get; set; }
    [JsonPropertyName("medianResponseMs")] public int? MedianResponseMs { get; set; }
    [JsonPropertyName("reportId")] public long? ReportId { get; set; }
    [JsonPropertyName("crawlRunId")] public long? CrawlRunId { get; set; }
    [JsonPropertyName("crawlOnly")] public bool? CrawlOnly { get; set; }
    [JsonPropertyName("generatedAtMs")] public double GeneratedAtMs { get; set; }
    [JsonPropertyName("domainParam")] public string DomainParam { get; set; } = "";
    [JsonPropertyName("crawlConfig")] public JsonNode? CrawlConfig { get; set; }
    [JsonPropertyName("dataSources")] public IReadOnlyList<string>? DataSources { get; set; }
}

public sealed class PortfolioCrawlHistoryPointDto
{
    [JsonPropertyName("pagesDiscovered")] public int PagesDiscovered { get; set; }
    [JsonPropertyName("titleCoverage")] public int TitleCoverage { get; set; }
    [JsonPropertyName("avgWordCount")] public int AvgWordCount { get; set; }
    [JsonPropertyName("createdAtMs")] public double CreatedAtMs { get; set; }
}

public sealed class PortfolioGroupsResponseDto
{
    [JsonPropertyName("groups")] public IReadOnlyList<PortfolioGroupDto> Groups { get; set; } = [];
    [JsonPropertyName("crawlHistoryByDomain")] public Dictionary<string, IReadOnlyList<PortfolioCrawlHistoryPointDto>> CrawlHistoryByDomain { get; set; } = [];
}

public sealed class PortfolioCardResponseDto
{
    [JsonPropertyName("group")] public PortfolioGroupDto? Group { get; set; }
}

public sealed class PortfolioSummaryResponseDto
{
    [JsonPropertyName("totalBrands")] public int TotalBrands { get; set; }
    [JsonPropertyName("totalUrls")] public int TotalUrls { get; set; }
    [JsonPropertyName("avgHealth")] public int? AvgHealth { get; set; }
}

public sealed class PortfolioReportRow
{
    public long Id { get; init; }
    public string? CanonicalDomain { get; init; }
    public string? SiteName { get; init; }
    public string? GeneratedAt { get; init; }
}

public sealed class PortfolioCrawlRunRow
{
    public long Id { get; init; }
    public string StartUrl { get; init; } = "";
    public string CreatedAt { get; init; } = "";
    public string? RenderMode { get; init; }
    public string? DiscoveryMode { get; init; }
}

public sealed class PortfolioCrawlSummaryRow
{
    public long CrawlRunId { get; init; }
    public string StartUrl { get; init; } = "";
    public string CreatedAt { get; init; } = "";
    public int UrlCount { get; init; }
    public int S2xx { get; init; }
    public int S3xx { get; init; }
    public int S4xx { get; init; }
    public int S5xx { get; init; }
    public int Other { get; init; }
    public int WithTitle { get; init; }
    public int AvgWordCount { get; init; }
    public int ThinPages { get; init; }
    public string? RenderMode { get; init; }
    public string? DiscoveryMode { get; init; }
}
