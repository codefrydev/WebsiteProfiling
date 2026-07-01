using System;

namespace Schema.Model.Entities;

public partial class SavedCrawlFilter
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Name { get; set; } = null!;

    public string FilterJson { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }
}
