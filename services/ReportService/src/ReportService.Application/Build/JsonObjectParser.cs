using System.Text.Json;

namespace ReportService.Application.Build;

internal static class JsonObjectParser
{
    public static IReadOnlyDictionary<string, object?>? AsDict(object? value)
    {
        if (value is IReadOnlyDictionary<string, object?> readOnly)
        {
            return readOnly;
        }

        if (value is Dictionary<string, object?> dict)
        {
            return dict;
        }

        if (value is JsonElement el && el.ValueKind == JsonValueKind.Object)
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(el.GetRawText());
        }

        return null;
    }

    public static IEnumerable<IReadOnlyDictionary<string, object?>> AsDictRows(object? value)
    {
        if (value is JsonElement el && el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                var row = AsDict(item);
                if (row is not null)
                {
                    yield return row;
                }
            }

            yield break;
        }

        if (value is IEnumerable<object?> rows)
        {
            foreach (var row in rows)
            {
                var dict = AsDict(row);
                if (dict is not null)
                {
                    yield return dict;
                }
            }
        }
    }
}
