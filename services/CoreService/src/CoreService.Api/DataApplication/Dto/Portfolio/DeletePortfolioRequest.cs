using System.Text.Json.Serialization;

namespace CoreService.Api.DataApplication.Dto.Portfolio;

public sealed class DeletePortfolioRequest
{
    [JsonPropertyName("reportId")]
    public long? ReportId { get; set; }

    [JsonPropertyName("crawlRunId")]
    public long? CrawlRunId { get; set; }
}
