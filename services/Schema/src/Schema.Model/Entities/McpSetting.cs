using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class McpSetting
{
    public long Id { get; set; }

    public string BearerToken { get; set; } = null!;

    public string AllowedHosts { get; set; } = null!;

    public string AllowedOrigins { get; set; } = null!;

    public string PublicUrl { get; set; } = null!;

    public string ToolBundle { get; set; } = null!;

    public string DisabledTools { get; set; } = null!;

    public string EnabledDomains { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
