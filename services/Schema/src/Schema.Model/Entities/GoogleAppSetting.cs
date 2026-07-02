using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class GoogleAppSetting
{
    public long Id { get; set; }

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }

    public string? ServiceAccountJson { get; set; }

    public int DefaultDateRangeDays { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public string? DeveloperToken { get; set; }

    public string? LoginCustomerId { get; set; }
}
