namespace IntegrationsService.Domain.Entities;

public sealed class CrawlSettingsRow
{
    public long Id { get; set; } = 1;

    public string StartUrl { get; set; } = "";
}
