using Npgsql;
using WebsiteProfiling.Data;

namespace WebsiteProfiling.Data.Tests;

public class NpgsqlDsnTests
{
    [Fact]
    public void Converts_compose_dsn_to_keyword_form()
    {
        var result = NpgsqlDsn.ToNpgsql("postgres://profiling:profiling@postgres:5432/website_profiling");

        var b = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal("postgres", b.Host);
        Assert.Equal(5432, b.Port);
        Assert.Equal("profiling", b.Username);
        Assert.Equal("profiling", b.Password);
        Assert.Equal("website_profiling", b.Database);
    }

    [Fact]
    public void Accepts_postgresql_scheme()
    {
        var b = new NpgsqlConnectionStringBuilder(
            NpgsqlDsn.ToNpgsql("postgresql://u:p@db.example.com:6543/mydb"));
        Assert.Equal("db.example.com", b.Host);
        Assert.Equal(6543, b.Port);
        Assert.Equal("mydb", b.Database);
    }

    [Fact]
    public void Defaults_port_when_absent()
    {
        var b = new NpgsqlConnectionStringBuilder(
            NpgsqlDsn.ToNpgsql("postgres://u:p@localhost/website_profiling"));
        Assert.Equal(5432, b.Port);
    }

    [Fact]
    public void Maps_connect_timeout_to_npgsql_timeout()
    {
        var b = new NpgsqlConnectionStringBuilder(
            NpgsqlDsn.ToNpgsql("postgres://u:p@h:5432/db?connect_timeout=3"));
        Assert.Equal(3, b.Timeout);
    }

    [Fact]
    public void Strips_unknown_query_params()
    {
        // Must not throw (Npgsql rejects unknown keywords); unknown params are dropped.
        var b = new NpgsqlConnectionStringBuilder(
            NpgsqlDsn.ToNpgsql("postgres://u:p@h:5432/db?connect_timeout=3&foo=bar&target_session_attrs=any"));
        Assert.Equal("h", b.Host);
        Assert.Equal(3, b.Timeout);
    }

    [Fact]
    public void Url_decodes_special_characters_in_password()
    {
        // Password "p@ss:word%1" percent-encoded in the URI userinfo.
        var b = new NpgsqlConnectionStringBuilder(
            NpgsqlDsn.ToNpgsql("postgres://user:p%40ss%3Aword%251@h:5432/db"));
        Assert.Equal("user", b.Username);
        Assert.Equal("p@ss:word%1", b.Password);
    }

    [Fact]
    public void Passes_through_keyword_connection_string()
    {
        const string keyword = "Host=h;Port=5432;Username=u;Password=p;Database=db";
        Assert.Equal(keyword, NpgsqlDsn.ToNpgsql(keyword));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Throws_on_empty(string raw)
    {
        Assert.Throws<InvalidOperationException>(() => NpgsqlDsn.ToNpgsql(raw));
    }
}
