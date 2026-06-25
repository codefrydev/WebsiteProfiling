using System.Text.Json.Nodes;

namespace AiService.Application.Repositories;

public static class LlmConfigPutHelpers
{
    public static Dictionary<string, string> ParsePutEntries(JsonObject state)
    {
        var entries = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var prop in state)
        {
            if (prop.Key.EndsWith("_masked", StringComparison.Ordinal))
            {
                continue;
            }

            entries[prop.Key] = CoerceValue(prop.Value);
        }

        return entries;
    }

    private static string CoerceValue(JsonNode? node)
    {
        if (node is null)
        {
            return "";
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<bool>(out var boolean))
            {
                return boolean ? "true" : "false";
            }

            if (value.TryGetValue<string>(out var text))
            {
                return text;
            }
        }

        return node.ToString();
    }
}
