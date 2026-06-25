using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Mapping;

public static class ToolResultMapper
{
    public static JsonObject ToJsonObject<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, ContractJsonOptions.Options);
        return JsonNode.Parse(json) as JsonObject ?? [];
    }
}
