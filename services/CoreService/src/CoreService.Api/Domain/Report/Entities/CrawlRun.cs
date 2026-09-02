namespace CoreService.Api.Domain.Report.Entities;

public sealed class CrawlRun
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string? StartUrl { get; set; }

    public string? RenderMode { get; set; }

    public string? DiscoveryMode { get; set; }

    public long? MobileRunId { get; set; }
}
