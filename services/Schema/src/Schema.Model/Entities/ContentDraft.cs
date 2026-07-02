using System;

namespace Schema.Model.Entities;

public partial class ContentDraft
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Title { get; set; } = null!;

    public string TargetKeyword { get; set; } = null!;

    public string? LandingUrl { get; set; }

    public string Status { get; set; } = null!;

    public string BodyHtml { get; set; } = null!;

    public string TitleTag { get; set; } = null!;

    public string MetaDescription { get; set; } = null!;

    public short? GradeScore { get; set; }

    public string? GradeSnapshot { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
