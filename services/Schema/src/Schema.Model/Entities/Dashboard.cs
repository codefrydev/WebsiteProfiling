using System;

namespace Schema.Model.Entities;

public partial class Dashboard
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Name { get; set; } = null!;

    public string LayoutJson { get; set; } = null!;

    public bool IsDefault { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
