using System.Text.Json.Nodes;

namespace AiService.Api.Application.Json;

/// <summary>
/// Safe JsonNode patterns — each JsonNode has a single parent; copy at boundaries.
/// </summary>
public static class JsonNodeCopy
{
    public static JsonObject CloneObject(JsonObject? node)
        => node?.DeepClone() as JsonObject ?? [];

    public static JsonArray CloneArray(JsonArray? node)
        => node?.DeepClone() as JsonArray ?? [];

    public static JsonObject DetachedCopy(JsonObject source)
        => CloneObject(source);
}
