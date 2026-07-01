using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LlmSetting
{
    public long Id { get; set; }

    public bool Enabled { get; set; }

    public string Provider { get; set; } = null!;

    public string ActiveModel { get; set; } = null!;

    public string OllamaBaseUrl { get; set; } = null!;

    public bool EnableNer { get; set; }

    public bool EnableKeyphrases { get; set; }

    public bool EnableSimilarInternal { get; set; }

    public bool EnableKeywordClusters { get; set; }

    public bool EnableIssueFixes { get; set; }

    public bool EnableAuditSummary { get; set; }

    public bool EnablePageCoach { get; set; }

    public bool EnableContentStudio { get; set; }

    public bool EnableDashboards { get; set; }

    public string ChatAssistantName { get; set; } = null!;

    public string ChatAssistantAvatarUrl { get; set; } = null!;

    public bool ChatUnlimitedToolRounds { get; set; }

    public bool ChatAllowCrawl { get; set; }

    public bool ChatFastNarrative { get; set; }

    public int MaxPages { get; set; }

    public int BatchSize { get; set; }

    public int Concurrency { get; set; }

    public int TimeoutSeconds { get; set; }

    public int SimilarTopK { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
