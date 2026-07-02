using System;

namespace Schema.Model.Entities;

public partial class GscLinksDatum
{
    public long Id { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public long PropertyId { get; set; }

    public string Data { get; set; } = null!;
}
