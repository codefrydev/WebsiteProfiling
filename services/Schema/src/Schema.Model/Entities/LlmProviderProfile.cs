using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LlmProviderProfile
{
    public string Provider { get; set; } = null!;

    public string ApiKey { get; set; } = null!;

    public string SavedModel { get; set; } = null!;

    public DateTimeOffset? ApiKeyUpdatedAt { get; set; }
}
