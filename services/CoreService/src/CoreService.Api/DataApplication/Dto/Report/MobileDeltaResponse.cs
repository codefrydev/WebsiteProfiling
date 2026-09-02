using System.Text.Json.Serialization;

namespace CoreService.Api.DataApplication.Dto.Report;

/// <summary>Per-URL desktop/mobile snapshot from <c>get_mobile_desktop_delta</c>.</summary>
public sealed class CrawlPageSnapshot
{
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("h1")] public string H1 { get; set; } = "";
    [JsonPropertyName("word_count")] public int WordCount { get; set; }
    [JsonPropertyName("status")] public int Status { get; set; }
}

public sealed class MobileDeltaItem
{
    [JsonPropertyName("url")] public string Url { get; set; } = "";
    [JsonPropertyName("desktop")] public CrawlPageSnapshot Desktop { get; set; } = new();
    [JsonPropertyName("mobile")] public CrawlPageSnapshot Mobile { get; set; } = new();
    [JsonPropertyName("title_differs")] public bool TitleDiffers { get; set; }
    [JsonPropertyName("h1_differs")] public bool H1Differs { get; set; }
    [JsonPropertyName("word_count_delta")] public int WordCountDelta { get; set; }
    [JsonPropertyName("status_differs")] public bool StatusDiffers { get; set; }
}

public sealed class MobileDeltaResponse
{
    [JsonPropertyName("deltas")] public IReadOnlyList<MobileDeltaItem> Deltas { get; set; } = [];
}
