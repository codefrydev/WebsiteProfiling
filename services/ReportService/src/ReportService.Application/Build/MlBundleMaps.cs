using System.Text.Json;

namespace ReportService.Application.Build;

internal static class MlBundleMaps
{
    public static Dictionary<string, string> UrlStringMap(IReadOnlyDictionary<string, object?> mlBundle, string key) =>
        ParseUrlMap(mlBundle, key, static el => el.ValueKind == JsonValueKind.String ? el.GetString() ?? "" : el.ToString());

    public static Dictionary<string, object?> UrlObjectMap(IReadOnlyDictionary<string, object?> mlBundle, string key) =>
        ParseUrlMap(mlBundle, key, static el => (object?)el.Clone());

    public static Dictionary<string, List<object?>> UrlListMap(IReadOnlyDictionary<string, object?> mlBundle, string key)
    {
        var result = new Dictionary<string, List<object?>>(StringComparer.Ordinal);
        if (!mlBundle.TryGetValue(key, out var raw) || raw is null)
        {
            return result;
        }

        if (raw is not JsonElement el || el.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var prop in el.EnumerateObject())
        {
            if (prop.Value.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var list = new List<object?>();
            foreach (var item in prop.Value.EnumerateArray())
            {
                list.Add(item.ValueKind switch
                {
                    JsonValueKind.String => item.GetString(),
                    JsonValueKind.Number => item.TryGetInt32(out var n) ? n : item.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => item.Clone(),
                });
            }

            result[prop.Name.Trim().TrimEnd('/')] = list;
        }

        return result;
    }

    private static Dictionary<string, T> ParseUrlMap<T>(
        IReadOnlyDictionary<string, object?> mlBundle,
        string key,
        Func<JsonElement, T> mapValue)
    {
        var result = new Dictionary<string, T>(StringComparer.Ordinal);
        if (!mlBundle.TryGetValue(key, out var raw) || raw is null)
        {
            return result;
        }

        if (raw is not JsonElement el || el.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var prop in el.EnumerateObject())
        {
            result[prop.Name.Trim().TrimEnd('/')] = mapValue(prop.Value);
        }

        return result;
    }
}
