using Npgsql;

namespace ReportService.Application.Persistence;

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

        return b.ConnectionString;
    }
}
