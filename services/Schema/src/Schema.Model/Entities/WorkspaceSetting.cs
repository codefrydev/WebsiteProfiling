using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class WorkspaceSetting
{
    public long Id { get; set; }

    public int? ActivePropertyId { get; set; }

    public string WarningMapperInput { get; set; } = null!;

    public string WarningMapperInputType { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
