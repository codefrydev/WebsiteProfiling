using System;

namespace Schema.Model.Entities;

public partial class LighthouseRun
{
    public long Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string Url { get; set; } = null!;

    public string Strategy { get; set; } = null!;

    public int RunIndex { get; set; }

    public string Data { get; set; } = null!;
}
