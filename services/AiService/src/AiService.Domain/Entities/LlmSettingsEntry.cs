namespace AiService.Domain.Entities;

public sealed class LlmSettingsEntry
{
    public long Id { get; set; } = 1;

    public bool Enabled { get; set; }

    public string Provider { get; set; } = "none";

    public string ActiveModel { get; set; } = "";

    public string OllamaBaseUrl { get; set; } = "http://127.0.0.1:11434";

    public bool EnableNer { get; set; } = true;

    public bool EnableKeyphrases { get; set; } = true;

    public bool EnableSimilarInternal { get; set; } = true;

    public bool EnableKeywordClusters { get; set; } = true;

    public bool EnableIssueFixes { get; set; } = true;

    public bool EnableAuditSummary { get; set; } = true;

    public bool EnablePageCoach { get; set; } = true;

    public bool EnableContentStudio { get; set; } = true;

    public bool EnableDashboards { get; set; } = true;

    public string ChatAssistantName { get; set; } = "AI Assistant";

    public string ChatAssistantAvatarUrl { get; set; } = "";

    public bool ChatUnlimitedToolRounds { get; set; }

    public bool ChatAllowCrawl { get; set; }

    public bool ChatFastNarrative { get; set; }

    public int MaxPages { get; set; } = 60;

    public int BatchSize { get; set; } = 5;

    public int Concurrency { get; set; } = 2;

    public int TimeoutSeconds { get; set; } = 120;

    public int SimilarTopK { get; set; } = 5;

    public DateTimeOffset UpdatedAt { get; set; }
}
