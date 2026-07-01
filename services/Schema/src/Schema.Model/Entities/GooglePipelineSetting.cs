using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class GooglePipelineSetting
{
    public long Id { get; set; }

    public string EnableGoogleSearchConsole { get; set; } = null!;

    public string EnableGoogleAnalytics { get; set; } = null!;

    public string GoogleDateRangeDays { get; set; } = null!;

    public string GoogleUrlGapListLimit { get; set; } = null!;

    public string EnrichKeywordsAfterReport { get; set; } = null!;

    public string EnableGoogleKeywordPlanner { get; set; } = null!;

    public string EnableKeywordForecast { get; set; } = null!;

    public string GoogleAdsLanguageId { get; set; } = null!;

    public string GoogleAdsGeoIds { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
