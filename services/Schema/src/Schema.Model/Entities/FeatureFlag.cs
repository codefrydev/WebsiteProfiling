using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class FeatureFlag
{
    public long Id { get; set; }

    public bool PipelineEnabled { get; set; }

    public bool WriteEnabled { get; set; }

    public bool PagesMdEnabled { get; set; }

    public bool ChatEnabled { get; set; }

    public bool McpVisible { get; set; }

    public bool SecretsVisible { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
