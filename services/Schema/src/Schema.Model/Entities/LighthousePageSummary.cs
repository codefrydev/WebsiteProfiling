using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LighthousePageSummary
{
    public string Url { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public string Data { get; set; } = null!;
}
