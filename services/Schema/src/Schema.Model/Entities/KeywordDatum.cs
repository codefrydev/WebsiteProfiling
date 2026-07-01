using System;

namespace Schema.Model.Entities;

public partial class KeywordDatum
{
    public long Id { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public string Data { get; set; } = null!;

    public long? PropertyId { get; set; }
}
