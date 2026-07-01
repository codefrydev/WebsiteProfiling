using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class UiPreference
{
    public long Id { get; set; }

    public string BrandName { get; set; } = null!;

    public string BrandSubtitle { get; set; } = null!;

    public string BrandLogoUrl { get; set; } = null!;

    public string? CustomThemeJson { get; set; }

    public string? UiPrefsJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
