using System.Text.Json.Serialization;
using WebsiteProfiling.Contracts.Crawl;

namespace WebsiteProfiling.Contracts.Report;

public sealed record CrawlPreviewDto
{
    [JsonPropertyName("id")]
    public long Id { get; init; }

    [JsonPropertyName("pages")]
    public IReadOnlyList<CrawlRow> Pages { get; init; } = [];

    [JsonPropertyName("total")]
    public int Total { get; init; }
}
