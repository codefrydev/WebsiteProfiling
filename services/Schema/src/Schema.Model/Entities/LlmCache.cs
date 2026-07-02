using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LlmCache
{
    public string CacheKey { get; set; } = null!;

    public string ResponseJson { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }
}
