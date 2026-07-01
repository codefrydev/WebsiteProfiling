using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class ContentAnalysisSetting
{
    public long Id { get; set; }

    public string EnableDuplicateDetection { get; set; } = null!;

    public string EnableLanguageDetection { get; set; } = null!;

    public string AnalysisFuzzyThreshold { get; set; } = null!;

    public string AnalysisSimhashHamming { get; set; } = null!;

    public string AnalysisSimhashMaxUrls { get; set; } = null!;

    public string AnalysisFuzzyMaxUrls { get; set; } = null!;

    public string AnalysisDupMaxPages { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
