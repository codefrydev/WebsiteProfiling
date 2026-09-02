namespace AiService.Api.Domain.Entities;

public sealed class IntegrationSecretsEntry
{
    public long Id { get; set; } = 1;

    public string BingWebmasterApiKey { get; set; } = "";

    public string SerpApiKey { get; set; } = "";

    public string GoogleRichResultsApiKey { get; set; } = "";

    public string CrawlAuthPassword { get; set; } = "";

    public string CrawlCookies { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
}
