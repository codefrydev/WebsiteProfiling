using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class KeywordSetting
{
    public long Id { get; set; }

    public string KeywordMaxPages { get; set; } = null!;

    public string KeywordGscMaxRows { get; set; } = null!;

    public string BrandName { get; set; } = null!;

    public string KeywordSeeds { get; set; } = null!;

    public string EnableGoogleSuggest { get; set; } = null!;

    public string EnableGoogleTrends { get; set; } = null!;

    public string EnableWikipediaTopic { get; set; } = null!;

    public string EnableDatamuse { get; set; } = null!;

    public string KeywordSuggestTopN { get; set; } = null!;

    public string KeywordMaxSuggestResults { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
