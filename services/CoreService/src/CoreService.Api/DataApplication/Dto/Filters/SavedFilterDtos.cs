using System.Text.Json;
using System.Text.Json.Serialization;

namespace CoreService.Api.DataApplication.Dto.Filters;

public sealed class SavedFilterRowDto
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("propertyId")]
    public long PropertyId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("filterJson")]
    public JsonElement FilterJson { get; set; }

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class SavedFilterListResponse
{
    [JsonPropertyName("filters")]
    public IReadOnlyList<SavedFilterRowDto> Filters { get; set; } = [];
}

public sealed class SavedFilterOkResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; } = true;
}

public sealed class UpsertSavedFilterRequest
{
    [JsonPropertyName("propertyId")]
    public long PropertyId { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("filterJson")]
    public JsonElement? FilterJson { get; set; }
}

public sealed class DeleteSavedFilterRequest
{
    [JsonPropertyName("propertyId")]
    public long PropertyId { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}
