using System;

namespace Schema.Model.Entities;

public partial class CompetitorKeywordGap
{
    public long PropertyId { get; set; }

    public string Data { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
