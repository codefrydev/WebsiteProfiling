namespace WebsiteProfiling.Contracts.Config;

/// <summary>Coerce flat pipeline state strings to Postgres column types (manifest-driven).</summary>
public static class TypedConfigValueCoercion
{
    public static object Coerce(string? value, string type, object? defaultValue = null) =>
        type switch
        {
            "bool" => ParseBool(value, defaultValue is bool b ? b : false),
            "int" => ParseInt(value, defaultValue is int n ? n : 0),
            _ => value ?? (defaultValue?.ToString() ?? ""),
        };

    public static bool ParseBool(string? raw, bool defaultValue = false)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() is "true" or "1" or "yes";
    }

    public static int ParseInt(string? raw, int defaultValue = 0)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        return int.TryParse(raw.Trim(), out var parsed) ? parsed : defaultValue;
    }
}
