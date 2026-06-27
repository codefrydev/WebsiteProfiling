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

        if (raw is JsonElement el && el.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in el.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                result[prop.Name.Trim()] = ParseJsonArray(prop.Value);
            }

            return result;
        }

        if (raw is IEnumerable<KeyValuePair<string, List<object?>>> typedMap)
        {
            foreach (var (url, list) in typedMap)
            {
                result[url.Trim()] = list;
            }
        }

        return result;
    }

    private static List<object?> ParseJsonArray(JsonElement arrayEl)
    {
        var list = new List<object?>();
        foreach (var item in arrayEl.EnumerateArray())
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

        return list;
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

        if (raw is JsonElement el && el.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in el.EnumerateObject())
            {
                result[prop.Name.Trim()] = mapValue(prop.Value);
            }

            return result;
        }

        if (raw is IReadOnlyDictionary<string, string> stringMap)
        {
            foreach (var (url, value) in stringMap)
            {
                result[url.Trim()] = mapValueFromObject(value);
            }

            return result;
        }

        if (raw is IEnumerable<KeyValuePair<string, object?>> objectMap)
        {
            foreach (var (url, value) in objectMap)
            {
                result[url.Trim()] = mapValueFromObject(value);
            }
        }

        return result;

        T mapValueFromObject(object? value) =>
            value switch
            {
                JsonElement jsonEl => mapValue(jsonEl),
                null => default!,
                string s when typeof(T) == typeof(string) => (T)(object)s,
                _ => typeof(T) == typeof(object) ? (T)value! : default!,
            };
    }
}
