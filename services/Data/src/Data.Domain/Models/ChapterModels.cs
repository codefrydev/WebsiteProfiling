namespace Data.Domain.Models;

public sealed class PdfBrandingModel
{
    public bool Enabled { get; init; }
    public string AgencyName { get; init; } = "";
    public string AgencySubtitle { get; init; } = "";
    public byte[]? LogoBytes { get; init; }
}

public sealed class AuditSnapshotModel
{
    public int? TotalUrls { get; init; }
    public int? IndexableUrls { get; init; }
    public int? TotalIssues { get; init; }
    public int? CriticalIssues { get; init; }
    public IReadOnlyDictionary<string, int> StatusCounts { get; init; } = new Dictionary<string, int>();
    public string? GoogleFetchedAt { get; init; }
    public string? RenderMode { get; init; }
}

public sealed class LinkSampleModel
{
    public string Url { get; init; } = "";
    public string Status { get; init; } = "";
    public string Title { get; init; } = "";
}

public sealed class LighthouseChapterModel
{
    public LighthouseSummaryModel Summary { get; init; } = new();
    public string HumanSummary { get; init; } = "";
    public IReadOnlyList<LighthouseDiagnosticModel> Diagnostics { get; init; } = [];
}

public sealed class LighthouseDiagnosticModel
{
    public string Title { get; init; } = "";
    public string Description { get; init; } = "";
}

public sealed class SearchVisibilityModel
{
    public IReadOnlyList<MetricRowModel> TopQueries { get; init; } = [];
    public IReadOnlyList<MetricRowModel> TopPages { get; init; } = [];
}

public sealed class TrafficSnapshotModel
{
    public IReadOnlyList<MetricRowModel> Channels { get; init; } = [];
    public IReadOnlyList<MetricRowModel> Devices { get; init; } = [];
}

public sealed class MetricRowModel
{
    public string Label { get; init; } = "";
    public string Value { get; init; } = "";
    public string? Secondary { get; init; }
}

public sealed class SecurityChapterModel
{
    public IReadOnlyList<SecurityFindingModel> Findings { get; init; } = [];
}

public sealed class SecurityFindingModel
{
    public string Severity { get; init; } = "";
    public string Type { get; init; } = "";
    public string Url { get; init; } = "";
    public string Message { get; init; } = "";
}

public sealed class ContentChapterModel
{
    public int? MeanWordCount { get; init; }
    public int? MedianWordCount { get; init; }
    public int? ThinContentCount { get; init; }
    public IReadOnlyList<MetricRowModel> TopKeywords { get; init; } = [];
}

public sealed class IndexationChapterModel
{
    public int? Indexable { get; init; }
    public int? NonIndexable { get; init; }
    public int? Blocked { get; init; }
    public string? Notes { get; init; }
}

public sealed class TocEntryModel
{
    public string Title { get; init; } = "";
    public PdfSectionId SectionId { get; init; }
}
