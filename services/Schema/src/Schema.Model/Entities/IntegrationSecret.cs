using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class IntegrationSecret
{
    public long Id { get; set; }

    public string BingWebmasterApiKey { get; set; } = null!;

    public string SerpApiKey { get; set; } = null!;

    public string GoogleRichResultsApiKey { get; set; } = null!;

    public string CrawlAuthPassword { get; set; } = null!;

    public string CrawlCookies { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
