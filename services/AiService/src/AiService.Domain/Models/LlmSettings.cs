namespace AiService.Domain.Models;

/// <summary>Singleton <c>llm_settings</c> row plus <c>llm_provider_profiles</c>.</summary>
public sealed class LlmSettings
{
    public bool Enabled { get; init; }

    public string Provider { get; init; } = "none";

    public string ActiveModel { get; init; } = "";

    public string OllamaBaseUrl { get; init; } = "http://127.0.0.1:11434";

    public bool EnableNer { get; init; } = true;

    public bool EnableKeyphrases { get; init; } = true;

    public bool EnableSimilarInternal { get; init; } = true;

    public bool EnableKeywordClusters { get; init; } = true;

    public bool EnableIssueFixes { get; init; } = true;

    public bool EnableAuditSummary { get; init; } = true;

    public bool EnablePageCoach { get; init; } = true;

    public bool EnableContentStudio { get; init; } = true;

    public bool EnableDashboards { get; init; } = true;

    public string ChatAssistantName { get; init; } = "AI Assistant";

    public string ChatAssistantAvatarUrl { get; init; } = "";

    public bool ChatUnlimitedToolRounds { get; init; }

    public bool ChatAllowCrawl { get; init; }

    public bool ChatFastNarrative { get; init; }

    public int MaxPages { get; init; } = 60;

    public int BatchSize { get; init; } = 5;

    public int Concurrency { get; init; } = 2;

    public int TimeoutSeconds { get; init; } = 120;

    public int SimilarTopK { get; init; } = 5;

    public DateTimeOffset UpdatedAt { get; init; }

    public IReadOnlyList<LlmProviderProfile> Providers { get; init; } = Array.Empty<LlmProviderProfile>();
}

public sealed class LlmProviderProfile
{
    public string Provider { get; init; } = "";

    public string ApiKey { get; init; } = "";

    public string SavedModel { get; init; } = "";

    public DateTimeOffset? ApiKeyUpdatedAt { get; init; }
}

/// <summary>Partial update for singleton <c>llm_settings</c> and optional provider saved models.</summary>
public sealed class LlmSettingsPatch
{
    public bool? Enabled { get; init; }

    public string? Provider { get; init; }

    public string? ActiveModel { get; init; }

    public string? OllamaBaseUrl { get; init; }

    public bool? EnableNer { get; init; }

    public bool? EnableKeyphrases { get; init; }

    public bool? EnableSimilarInternal { get; init; }

    public bool? EnableKeywordClusters { get; init; }

    public bool? EnableIssueFixes { get; init; }

    public bool? EnableAuditSummary { get; init; }

    public bool? EnablePageCoach { get; init; }

    public bool? EnableContentStudio { get; init; }

    public bool? EnableDashboards { get; init; }

    public string? ChatAssistantName { get; init; }

    public string? ChatAssistantAvatarUrl { get; init; }

    public bool? ChatUnlimitedToolRounds { get; init; }

    public bool? ChatAllowCrawl { get; init; }

    public bool? ChatFastNarrative { get; init; }

    public int? MaxPages { get; init; }

    public int? BatchSize { get; init; }

    public int? Concurrency { get; init; }

    public int? TimeoutSeconds { get; init; }

    public int? SimilarTopK { get; init; }

    public IReadOnlyList<LlmProviderProfilePatch>? ProviderProfiles { get; init; }
}

public sealed class LlmProviderProfilePatch
{
    public required string Provider { get; init; }

    public string? SavedModel { get; init; }
}

public sealed class LlmSettingsPutRequest
{
    public LlmSettingsPatch? Settings { get; init; }
}

public sealed class LlmSettingsGetResponse
{
    public required LlmSettings Settings { get; init; }

    public string Source { get; init; } = "db";

    public bool ApiKeyConfigured { get; init; }
}
