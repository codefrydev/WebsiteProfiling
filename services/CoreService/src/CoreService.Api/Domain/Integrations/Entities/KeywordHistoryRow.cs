namespace CoreService.Api.Domain.Integrations.Entities;

public sealed class KeywordHistoryRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public string Keyword { get; set; } = "";

    public DateTimeOffset? FetchedAt { get; set; }

    public double? Position { get; set; }

    public long? Clicks { get; set; }

    public long? Impressions { get; set; }

    public double? Ctr { get; set; }
}
