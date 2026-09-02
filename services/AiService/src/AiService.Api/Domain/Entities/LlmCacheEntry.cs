namespace AiService.Api.Domain.Entities;

public sealed class LlmCacheEntry
{
    public string CacheKey { get; set; } = "";

    public string ResponseJson { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; }
}
