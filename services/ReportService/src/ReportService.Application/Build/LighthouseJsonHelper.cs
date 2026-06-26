using System.Text.Json;
using System.Text.Json.Nodes;

namespace ReportService.Application.Build;

internal static class LighthouseJsonHelper
{
    public static Dictionary<string, object?>? NodeToDictionary(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        return JsonSerializer.Deserialize<Dictionary<string, object?>>(node.ToJsonString());
    }

    public static object? ExtractList(IReadOnlyDictionary<string, object?>? dict, string key)
    {
        if (dict is null || !dict.TryGetValue(key, out var val) || val is null)
        {
            return Array.Empty<object>();
        }

        return val;
    }

    public static string ExtractHumanSummary(IReadOnlyDictionary<string, object?>? summary) =>
        summary?.GetValueOrDefault("human_summary_full")?.ToString()
        ?? summary?.GetValueOrDefault("human_summary")?.ToString()
        ?? "";
}
