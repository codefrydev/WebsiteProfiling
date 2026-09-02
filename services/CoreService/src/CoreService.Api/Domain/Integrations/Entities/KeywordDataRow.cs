namespace CoreService.Api.Domain.Integrations.Entities;

public sealed class KeywordDataRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public DateTimeOffset? FetchedAt { get; set; }

    public string Data { get; set; } = "{}";
}
