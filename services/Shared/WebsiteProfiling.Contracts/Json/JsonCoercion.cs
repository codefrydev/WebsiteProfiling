using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WebsiteProfiling.Contracts.Json;

/// <summary>
/// Safe scalar extraction from JSON values. Tool results and report payloads can carry
/// unexpected types (e.g. a string where a number is expected). These helpers return
/// defaults on mismatch instead of throwing.
/// </summary>
public static class JsonCoercion
{
    /// <summary>Returns the value as a string only when the node is a JSON string; otherwise null.</summary>
    public static string? AsString(JsonNode? node)
        => node is JsonValue value && value.TryGetValue<string>(out var s) ? s : null;

    /// <summary>Returns the value as a double when the node is a JSON number; otherwise null.</summary>
    public static double? AsDouble(JsonNode? node)
        => node is JsonValue value && value.TryGetValue<double>(out var d) ? d : null;

    /// <summary>Returns the value as an int when the node is a JSON number (rounding floats); otherwise null.</summary>
    public static int? AsInt(JsonNode? node)
        => AsDouble(node) is { } d ? (int)Math.Round(d) : null;

    /// <summary>Coerce a JSON scalar to a double, mirroring Python <c>float(val)</c> with a default.</summary>
    public static double Num(JsonNode? node, double @default = 0.0)
    {
        if (node is not JsonValue value)
        {
            return @default;
        }

        if (value.TryGetValue<double>(out var d))
        {
            return d;
        }

        if (value.TryGetValue<string>(out var s)
            && double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return @default;
    }

    public static string? GetString(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop))
        {
            return null;
        }

        return prop.ValueKind switch
        {
            JsonValueKind.String => prop.GetString(),
            JsonValueKind.Number => prop.TryGetInt64(out var l)
                ? l.ToString(CultureInfo.InvariantCulture)
                : prop.GetDouble().ToString(CultureInfo.InvariantCulture),
            _ => null,
        };
    }

    public static int? GetInt(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return (int)Math.Round(prop.GetDouble());
    }

    public static double? GetDouble(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return prop.GetDouble();
    }

    public static bool GetBool(JsonElement el, string name, bool @default = false)
    {
        if (!el.TryGetProperty(name, out var prop))
        {
            return @default;
        }

        return prop.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => prop.GetString()?.ToLowerInvariant() is "true" or "1" or "yes",
            JsonValueKind.Number => prop.TryGetInt32(out var i) && i != 0,
            _ => @default,
        };
    }

    /// <summary>Python truthy check for JSON scalars (true, "true", "1", "yes", non-zero number).</summary>
    public static bool IsTruthy(JsonNode? node)
    {
        if (node is null)
        {
            return false;
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<bool>(out var b))
            {
                return b;
            }

            if (value.TryGetValue<int>(out var i))
            {
                return i != 0;
            }

            if (value.TryGetValue<long>(out var l))
            {
                return l != 0;
            }

            if (value.TryGetValue<double>(out var d))
            {
                return d != 0;
            }

            if (value.TryGetValue<string>(out var s))
            {
                return s.ToLowerInvariant() switch
                {
                    "" or "false" or "0" or "no" => false,
                    _ => true,
                };
            }
        }

        return false;
    }
}
