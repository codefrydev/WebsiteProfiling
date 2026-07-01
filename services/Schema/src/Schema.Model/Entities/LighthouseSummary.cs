using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LighthouseSummary
{
    public long Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string Data { get; set; } = null!;
}
