using System.Globalization;

namespace Data.Application.Json;

/// <summary>
/// Formats timestamps to match Python's <c>datetime.isoformat()</c> on the UTC values returned by
/// psycopg for <c>TIMESTAMPTZ</c> columns. Rules: offset is rendered as <c>+00:00</c>; the fractional
/// part is OMITTED entirely when microseconds are zero, otherwise rendered as exactly 6 digits
/// (Python keeps trailing zeros and never truncates to milliseconds).
/// </summary>
/// <remarks>
/// Assumes the Postgres session timezone is UTC (the <c>postgres:16-alpine</c> default), so both
/// psycopg and Npgsql surface the same instant at offset 0. Parity is anchored by golden fixtures
/// captured from FastAPI against the same database.
/// </remarks>
public static class PyIso
{
    public static string Format(DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        var basePart = utc.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        var microseconds = (utc.Ticks % TimeSpan.TicksPerSecond) / 10; // 100ns ticks → microseconds
        var frac = microseconds == 0
            ? string.Empty
            : "." + microseconds.ToString("D6", CultureInfo.InvariantCulture);
        return $"{basePart}{frac}+00:00";
    }
}
