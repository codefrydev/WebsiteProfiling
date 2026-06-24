using System.Text.Json.Serialization;

namespace Data.Application.Dto.Report;

/// <summary>Port of the items returned by <c>list_audit_history</c> in report_loader.py.</summary>
public sealed class AuditHistoryItem
{
    [JsonPropertyName("reportId")] public long ReportId { get; set; }
    [JsonPropertyName("canonicalDomain")] public string? CanonicalDomain { get; set; }
    [JsonPropertyName("siteName")] public string? SiteName { get; set; }
    [JsonPropertyName("generatedAt")] public string GeneratedAt { get; set; } = "";
    [JsonPropertyName("healthScore")] public int? HealthScore { get; set; }
    [JsonPropertyName("categoryScores")] public Dictionary<string, double> CategoryScores { get; set; } = [];
    [JsonPropertyName("issueCounts")] public Dictionary<string, int> IssueCounts { get; set; } = [];
    [JsonPropertyName("perfScore")] public int? PerfScore { get; set; }
    [JsonPropertyName("seoScore")] public int? SeoScore { get; set; }
    [JsonPropertyName("technicalSeoScore")] public int? TechnicalSeoScore { get; set; }
}

public sealed class AuditHistoryResponse
{
    [JsonPropertyName("history")] public IReadOnlyList<AuditHistoryItem> History { get; set; } = [];
}
