using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace AiService.Providers.Chat;

public static partial class JsonResponseParser
{
    public static JsonObject Parse(string? text)
    {
        var trimmed = (text ?? "").Trim();
        if (trimmed.Length == 0)
        {
            return [];
        }

        try
        {
            var node = JsonNode.Parse(trimmed);
            return node switch
            {
                JsonObject obj => obj,
                JsonValue or JsonArray => new JsonObject { ["data"] = node.DeepClone() },
                _ => [],
            };
        }
        catch (JsonException)
        {
            // fall through
        }

        var match = JsonObjectPattern().Match(trimmed);
        if (match.Success)
        {
            try
            {
                var node = JsonNode.Parse(match.Value);
                if (node is JsonObject obj)
                {
                    return obj;
                }

                if (node is not null)
                {
                    return new JsonObject { ["data"] = node.DeepClone() };
                }
            }
            catch (JsonException)
            {
                // fall through
            }
        }

        return [];
    }

    [GeneratedRegex(@"\{[\s\S]*\}", RegexOptions.Singleline)]
    private static partial Regex JsonObjectPattern();
}
