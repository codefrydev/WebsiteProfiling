using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Mapping;

public static class ToolArgsMapper
{
    public static T Parse<T>(JsonObject args) where T : new()
    {
        try
        {
            var json = args.ToJsonString();
            return JsonSerializer.Deserialize<T>(json, ContractJsonOptions.Options) ?? new T();
        }
        catch (JsonException)
        {
            return new T();
        }
    }
}
