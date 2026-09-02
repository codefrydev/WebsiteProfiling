namespace CoreService.Api.Domain.Report.Entities;

public sealed class LighthouseGlobalSummary
{
    public long Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string Data { get; set; } = "{}";
}
