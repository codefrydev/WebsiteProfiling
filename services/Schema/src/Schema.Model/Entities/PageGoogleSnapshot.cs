using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class PageGoogleSnapshot
{
    public long Id { get; set; }

    public string PageUrl { get; set; } = null!;

    public string UrlNorm { get; set; } = null!;

    public DateTimeOffset FetchedAt { get; set; }

    public string Data { get; set; } = null!;
}
