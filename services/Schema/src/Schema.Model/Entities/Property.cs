using System;

namespace Schema.Model.Entities;

public partial class Property
{
    public long Id { get; set; }

    public string Name { get; set; } = null!;

    public string CanonicalDomain { get; set; } = null!;

    public string? SiteUrl { get; set; }

    public string? GscSiteUrl { get; set; }

    public string? Ga4PropertyId { get; set; }

    public string? DefaultCrawlPreset { get; set; }

    public DateTimeOffset? CrawlAuthorizedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public string? GoogleAuthMode { get; set; }

    public string? GoogleRefreshToken { get; set; }

    public DateTimeOffset? GoogleConnectedAt { get; set; }

    public string? GoogleConnectedEmail { get; set; }

    public int? GoogleDateRangeDays { get; set; }

    public string? ScheduleCron { get; set; }

    public string? AlertWebhookUrl { get; set; }

    public string? AlertEmail { get; set; }
}
