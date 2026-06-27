using Npgsql;

namespace AiService.Application.Persistence;

/// <summary>
/// Converts a libpq connection URI into an Npgsql keyword connection string.
/// </summary>
public static class NpgsqlDsn
{
    public static string ToNpgsql(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new InvalidOperationException(
                "DATABASE_URL is not set. Example: postgres://user:pass@host:5432/website_profiling");
        }

        var s = raw.Trim();
        var isUri = s.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
                    || s.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);
        if (!isUri)
        {
            return s;
        }

        var uri = new Uri(s);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = Uri.UnescapeDataString(uri.Host),
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
        };

        var userInfo = uri.UserInfo.Split(':', 2);
        if (userInfo.Length > 0 && userInfo[0].Length > 0)
        {
            b.Username = Uri.UnescapeDataString(userInfo[0]);
        }

        if (userInfo.Length > 1)
        {
            b.Password = Uri.UnescapeDataString(userInfo[1]);
        }

        foreach (var (key, value) in ParseQuery(uri.Query))
        {
            switch (key.ToLowerInvariant())
            {
                case "connect_timeout":
                    if (int.TryParse(value, out var t))
                    {
                        b.Timeout = t;
                    }

                    break;
                case "sslmode":
                    if (Enum.TryParse<SslMode>(value, ignoreCase: true, out var mode))
                    {
                        b.SslMode = mode;
                    }

                    break;
                case "application_name":
                    b.ApplicationName = value;
                    break;
            }
        }

        return b.ConnectionString;
    }

    private static IEnumerable<KeyValuePair<string, string>> ParseQuery(string query)
    {
        var q = query.TrimStart('?');
        if (q.Length == 0)
        {
            yield break;
        }

        foreach (var part in q.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var idx = part.IndexOf('=');
            yield return idx < 0
                ? new KeyValuePair<string, string>(Uri.UnescapeDataString(part), "")
                : new KeyValuePair<string, string>(
                    Uri.UnescapeDataString(part[..idx]),
                    Uri.UnescapeDataString(part[(idx + 1)..]));
        }
    }
}
