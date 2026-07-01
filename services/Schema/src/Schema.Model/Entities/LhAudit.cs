using System;

namespace Schema.Model.Entities;

public partial class LhAudit
{
    public long Id { get; set; }

    public long RunId { get; set; }

    public string AuditId { get; set; } = null!;

    public string? CategoryId { get; set; }

    public double? Score { get; set; }

    public string? ScoreDisplayMode { get; set; }

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? DisplayValue { get; set; }

    public double? NumericValue { get; set; }

    public string? HelpText { get; set; }

    public string? DetailsType { get; set; }

    public string? DetailsHeadings { get; set; }

    public string? DetailsMeta { get; set; }
}
