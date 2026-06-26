namespace IntegrationsService.Domain.Entities;

public sealed class IntegrationSecretsRow
{
    public long Id { get; set; } = 1;

    public string BingWebmasterApiKey { get; set; } = "";
}
