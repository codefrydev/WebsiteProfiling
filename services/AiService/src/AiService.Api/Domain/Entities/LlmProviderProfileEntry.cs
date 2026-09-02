namespace AiService.Api.Domain.Entities;

public sealed class LlmProviderProfileEntry
{
    public string Provider { get; set; } = "";

    public string ApiKey { get; set; } = "";

    public string SavedModel { get; set; } = "";

    public DateTimeOffset? ApiKeyUpdatedAt { get; set; }
}
