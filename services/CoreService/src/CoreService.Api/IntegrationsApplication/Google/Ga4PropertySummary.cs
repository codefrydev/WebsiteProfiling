using System.Text.Json.Serialization;

namespace CoreService.Api.IntegrationsApplication.Google;

public sealed class Ga4PropertySummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; init; } = "";

    [JsonPropertyName("accountName")]
    public string AccountName { get; init; } = "";
}
