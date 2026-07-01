using System;

namespace Schema.Model.Entities;

public partial class CruxSnapshot
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public string Origin { get; set; } = null!;

    public string? Url { get; set; }

    public string Metrics { get; set; } = null!;

    public DateTimeOffset FetchedAt { get; set; }
}
