using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class KeywordSuggestCache
{
    public string CacheKey { get; set; } = null!;

    public DateTimeOffset FetchedAt { get; set; }

    public string Data { get; set; } = null!;
}
