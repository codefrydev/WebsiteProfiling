using System.Text.Json;
using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Json;

/// <summary>Shared <see cref="JsonSerializerOptions"/> for DB/API payloads (snake_case keys).</summary>
public static class ContractJsonOptions
{
    public static JsonSerializerOptions Options { get; } = Create();

    public static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented = false,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}
