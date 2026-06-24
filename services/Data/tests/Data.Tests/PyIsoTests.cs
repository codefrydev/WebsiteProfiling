using Data.Application.Json;

namespace Data.Tests;

public class PyIsoTests
{
    [Fact]
    public void Omits_fraction_when_microseconds_zero()
    {
        var value = new DateTimeOffset(2026, 6, 24, 15, 30, 0, TimeSpan.Zero);
        Assert.Equal("2026-06-24T15:30:00+00:00", PyIso.Format(value));
    }

    [Fact]
    public void Renders_six_digit_microseconds_with_trailing_zeros()
    {
        // 123000 microseconds → Python isoformat keeps all 6 digits ("...123000"), not ".123".
        var value = new DateTimeOffset(2026, 6, 24, 15, 30, 0, TimeSpan.Zero).AddTicks(123000 * 10);
        Assert.Equal("2026-06-24T15:30:00.123000+00:00", PyIso.Format(value));
    }

    [Fact]
    public void Renders_full_microsecond_precision()
    {
        var value = new DateTimeOffset(2026, 6, 24, 15, 30, 0, TimeSpan.Zero).AddTicks(123456 * 10);
        Assert.Equal("2026-06-24T15:30:00.123456+00:00", PyIso.Format(value));
    }

    [Fact]
    public void Normalizes_non_utc_offset_to_utc()
    {
        // 21:00+05:30 is the same instant as 15:30Z; Python/psycopg surface UTC, so we render +00:00.
        var value = new DateTimeOffset(2026, 6, 24, 21, 0, 0, TimeSpan.FromHours(5.5));
        Assert.Equal("2026-06-24T15:30:00+00:00", PyIso.Format(value));
    }
}
