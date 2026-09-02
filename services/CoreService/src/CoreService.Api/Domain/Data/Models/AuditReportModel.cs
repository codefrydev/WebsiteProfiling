using WebsiteProfiling.Contracts.Report;

namespace CoreService.Api.Domain.Data.Models;

public enum PdfProfile
{
    Executive,
    Standard,
    Full,
    Premium,
}

public sealed class AuditReportModel
{
    public int ReportId { get; init; }
    public string SiteName { get; init; } = "Site";
    public string ReportTitle { get; init; } = "Technical SEO Audit Report";
    public string GeneratedAt { get; init; } = "";
    public string ExportedAt { get; init; } = "";
    public int? HealthScore { get; init; }
    public string ScoreBand { get; init; } = "";
    public int TotalIssueCount { get; init; }
    public IReadOnlyList<string> DataSources { get; init; } = [];
    public PdfBrandingModel Branding { get; init; } = new();
    public ExecutiveSummaryModel ExecutiveSummary { get; init; } = new();
    public IReadOnlyList<CategoryScoreModel> CategoryScores { get; init; } = [];
    public IReadOnlyList<IssueRecord> Issues { get; init; } = [];
    public IReadOnlyDictionary<string, int> IssueCounts { get; init; } = new Dictionary<string, int>();
    public AuditSnapshotModel? Snapshot { get; init; }
    public LighthouseChapterModel? Lighthouse { get; init; }
    public SearchVisibilityModel? SearchVisibility { get; init; }
    public TrafficSnapshotModel? Traffic { get; init; }
    public SecurityChapterModel? Security { get; init; }
    public ContentChapterModel? Content { get; init; }
    public IndexationChapterModel? Indexation { get; init; }
    public IReadOnlyList<LinkSampleModel> LinkSamples { get; init; } = [];
    public IReadOnlyList<string> TruncationNotes { get; init; } = [];
    public CrawlScopeModel? CrawlScope { get; init; }
    public IReadOnlyList<TocEntryModel> TableOfContents { get; init; } = [];
}

public sealed class ExecutiveSummaryModel
{
    public string Summary { get; init; } = "";
    public string SourceLabel { get; init; } = "";
    public IReadOnlyList<string> Priorities { get; init; } = [];
    public IReadOnlyList<IssueRecord> TopIssues { get; init; } = [];
}

public sealed class CategoryScoreModel
{
    public string Name { get; init; } = "";
    public int? Score { get; init; }
    public int IssueCount { get; init; }
}

public sealed class LighthouseSummaryModel
{
    public string Url { get; init; } = "";
    public int? Performance { get; init; }
    public int? Accessibility { get; init; }
    public int? BestPractices { get; init; }
    public int? Seo { get; init; }
}

public sealed class CrawlScopeModel
{
    public int? PagesCrawled { get; init; }
    public int? MaxPagesConfigured { get; init; }
}

public sealed class ReportListRow
{
    public int Id { get; init; }
    public string? CanonicalDomain { get; init; }
    public string? SiteName { get; init; }
    public string? GeneratedAt { get; init; }
}
