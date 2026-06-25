using System.Text.Json.Nodes;

namespace AiService.Tools.Slice;

/// <summary>
/// Shared list slicing and payload field helpers for audit tools. Mirrors Python
/// <c>website_profiling.tools.audit_tools._slice</c>.
/// </summary>
public static class PayloadSliceHelpers
{
    public static int ParseLimit(JsonNode? raw, int defaultValue, int maxCap)
    {
        int limit;
        try
        {
            if (raw is JsonValue value && value.TryGetValue(out int intValue))
            {
                limit = intValue;
            }
            else
            {
                limit = int.Parse(raw?.ToString() ?? defaultValue.ToString());
            }
        }
        catch (FormatException)
        {
            limit = defaultValue;
        }
        catch (OverflowException)
        {
            limit = defaultValue;
        }

        return Math.Max(1, Math.Min(limit, maxCap));
    }

    public static JsonObject CapList(IReadOnlyList<JsonNode?> items, int limit, int? maxCap = null)
    {
        var cap = maxCap ?? limit;
        limit = Math.Max(1, Math.Min(limit, cap));
        var total = items.Count;
        var truncated = total > limit;
        var slice = new JsonArray();
        for (var i = 0; i < Math.Min(limit, total); i++)
        {
            slice.Add(items[i]?.DeepClone());
        }

        return new JsonObject
        {
            ["items"] = slice,
            ["total"] = total,
            ["truncated"] = truncated,
        };
    }

    public static JsonObject PayloadField(
        JsonObject payload,
        string key,
        int limit = 50,
        int maxCap = 50,
        Func<JsonNode?, bool>? filterFn = null,
        string itemKey = "items")
    {
        if (!payload.TryGetPropertyValue(key, out var raw) || raw is null)
        {
            return new JsonObject
            {
                [itemKey] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
                ["missing"] = true,
            };
        }

        if (raw is not JsonArray array)
        {
            var single = new JsonArray();
            var total = 0;
            if (raw is JsonValue value && string.IsNullOrEmpty(value.ToString()))
            {
                total = 0;
            }
            else if (raw is not null)
            {
                single.Add(raw.DeepClone());
                total = 1;
            }

            return new JsonObject
            {
                [itemKey] = single,
                ["total"] = total,
                ["truncated"] = false,
            };
        }

        var items = new List<JsonNode?>();
        foreach (var element in array)
        {
            if (filterFn is null || filterFn(element))
            {
                items.Add(element);
            }
        }

        var sliced = CapList(items, limit, maxCap);
        return new JsonObject
        {
            [itemKey] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static JsonObject PayloadDictSlice(
        JsonObject payload,
        string key,
        IReadOnlyList<string>? fields = null)
    {
        if (!payload.TryGetPropertyValue(key, out var raw) || raw is not JsonObject dict)
        {
            return new JsonObject
            {
                ["data"] = null,
                ["missing"] = true,
            };
        }

        if (fields is null || fields.Count == 0)
        {
            return new JsonObject
            {
                ["data"] = dict.DeepClone(),
                ["missing"] = false,
            };
        }

        var data = new JsonObject();
        foreach (var field in fields)
        {
            if (dict.TryGetPropertyValue(field, out var value))
            {
                data[field] = value?.DeepClone();
            }
        }

        return new JsonObject
        {
            ["data"] = data,
            ["missing"] = false,
        };
    }
}
