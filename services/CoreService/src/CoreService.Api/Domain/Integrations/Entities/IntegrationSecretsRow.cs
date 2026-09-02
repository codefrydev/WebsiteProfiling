namespace CoreService.Api.Domain.Integrations.Entities;

public sealed class IntegrationSecretsRow
{
    public long Id { get; set; } = 1;

    public string BingWebmasterApiKey { get; set; } = "";
}
