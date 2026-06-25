namespace IntegrationsService.Domain.Entities;

/// <summary>Property row with Google integration columns from <c>properties</c>.</summary>
public sealed class Property
{
    public long Id { get; set; }

    public string? Name { get; set; }

    public string? CanonicalDomain { get; set; }

    public string? SiteUrl { get; set; }

    public string? GscSiteUrl { get; set; }

    public string? Ga4PropertyId { get; set; }

    public string? GoogleAuthMode { get; set; }

    public string? GoogleRefreshToken { get; set; }

    public DateTimeOffset? GoogleConnectedAt { get; set; }

    public string? GoogleConnectedEmail { get; set; }

    public int? GoogleDateRangeDays { get; set; }

    public string? DefaultCrawlPreset { get; set; }

    public DateTimeOffset? CrawlAuthorizedAt { get; set; }
}
