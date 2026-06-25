using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Application.Chat;

/// <summary>
/// Safe scalar extraction from <see cref="JsonNode"/> values. Delegates to
/// <see cref="JsonCoercion"/> in WebsiteProfiling.Contracts.
/// </summary>
internal static class JsonScalar
{
    public static string? AsString(JsonNode? node) => JsonCoercion.AsString(node);

    public static double? AsDouble(JsonNode? node) => JsonCoercion.AsDouble(node);

    public static int? AsInt(JsonNode? node) => JsonCoercion.AsInt(node);
}
