using System.Text.Json.Serialization;

namespace Data.Application.Dto.Meta;

/// <summary>
/// Response shape for <c>GET /api/report/meta</c>. Mirrors the FastAPI router which returns
/// <c>{"reports": list_reports(...), "crawlRuns": list_crawl_runs(...)}</c>. Item keys are
/// snake_case (straight from SQL columns), so each property carries an explicit
/// <see cref="JsonPropertyNameAttribute"/> — the service must NOT apply a global camelCase policy.
/// </summary>
public sealed class ReportMetaResponse
{
    [JsonPropertyName("reports")]
    public required IReadOnlyList<ReportListItem> Reports { get; init; }

    [JsonPropertyName("crawlRuns")]
    public required IReadOnlyList<CrawlRunItem> CrawlRuns { get; init; }
}

/// <summary>One row of <c>list_reports</c> — snake_case keys.</summary>
public sealed class ReportListItem
{
    [JsonPropertyName("id")]
    public long Id { get; init; }

    [JsonPropertyName("canonical_domain")]
    public string? CanonicalDomain { get; init; }

    [JsonPropertyName("site_name")]
    public string? SiteName { get; init; }

    [JsonPropertyName("generated_at")]
    public string? GeneratedAt { get; init; }
}

/// <summary>One row of <c>list_crawl_runs</c> — snake_case keys.</summary>
public sealed class CrawlRunItem
{
    [JsonPropertyName("id")]
    public long Id { get; init; }

    /// <summary>Python coerces a null <c>start_url</c> to the empty string (<c>str(... or "")</c>).</summary>
    [JsonPropertyName("start_url")]
    public string StartUrl { get; init; } = "";

    [JsonPropertyName("created_at")]
    public string? CreatedAt { get; init; }

    [JsonPropertyName("render_mode")]
    public string? RenderMode { get; init; }

    [JsonPropertyName("discovery_mode")]
    public string? DiscoveryMode { get; init; }
}
