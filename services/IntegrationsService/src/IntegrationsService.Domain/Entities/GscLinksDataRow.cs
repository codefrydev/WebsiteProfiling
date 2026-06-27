namespace IntegrationsService.Domain.Entities;

public sealed class GscLinksDataRow
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public DateTimeOffset? FetchedAt { get; set; }

    public string Data { get; set; } = "{}";
}
