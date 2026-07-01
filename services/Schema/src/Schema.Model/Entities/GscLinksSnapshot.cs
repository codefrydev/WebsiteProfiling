using System;

namespace Schema.Model.Entities;

public partial class GscLinksSnapshot
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public int ReferringDomains { get; set; }

    public string TopDomains { get; set; } = null!;
}
