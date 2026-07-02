using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class ReportPayload
{
    public long Id { get; set; }

    public DateTimeOffset GeneratedAt { get; set; }

    public string Data { get; set; } = null!;

    public string? SiteName { get; set; }

    public string? CanonicalDomain { get; set; }
}
