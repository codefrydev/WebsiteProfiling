using System;

namespace Schema.Model.Entities;

public partial class KeywordHistory
{
    public long Id { get; set; }

    public string Keyword { get; set; } = null!;

    public DateTimeOffset FetchedAt { get; set; }

    public double? Position { get; set; }

    public int? Clicks { get; set; }

    public int? Impressions { get; set; }

    public double? Ctr { get; set; }

    public long? PropertyId { get; set; }
}
