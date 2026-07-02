using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class AuditStepSetting
{
    public long Id { get; set; }

    public string RunCrawl { get; set; } = null!;

    public string RunReport { get; set; } = null!;

    public string RunPlot { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
