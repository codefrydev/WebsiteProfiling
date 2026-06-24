using Bff.Application.Auth;

namespace Bff.Tests;

/// <summary>
/// Byte-compatibility tests for wp_session. These are the trust anchor for "sessions survive
/// the cutover" — the golden vectors are HMACs produced by the same algorithm as auth.ts.
/// </summary>
public class WpSessionTokensTests
{
    private const string Secret = "test-secret-123";

    // Vectors produced exactly as web/src/server/auth.ts would: "{role}:{exp}.{hmacSha256Hex(secret, payload)}".
    private const string AnalystToken = "analyst:9999999999.7b9413bfc6f167f189d749e6105bdee01e202e445e86cce18acc49aeb2b2c338";
    private const string AdminToken = "admin:9999999999.f4d51fd58e594e247afc3472d5a73972a38e30f9013f0a1686f8719d24f705e6";
    private const string TrailingGarbageExpToken = "analyst:9999999999abc.57f60696d1f73f95b888c6b22865f562d473a2e3d3fcf5c8b3c3a953583487ef";

    [Fact]
    public void Verify_accepts_node_produced_golden_vectors()
    {
        Assert.Equal("analyst", WpSessionTokens.VerifyRole(AnalystToken, Secret, nowUnixSeconds: 1000));
        Assert.Equal("admin", WpSessionTokens.VerifyRole(AdminToken, Secret, nowUnixSeconds: 1000));
    }

    [Fact]
    public void Verify_accepts_trailing_garbage_exp_like_js_parseInt()
    {
        // Node parseInt("9999999999abc", 10) === 9999999999 (valid, future). C# must agree.
        Assert.Equal("analyst", WpSessionTokens.VerifyRole(TrailingGarbageExpToken, Secret, nowUnixSeconds: 1000));
    }

    [Fact]
    public void Verify_is_case_insensitive_on_hex_signature()
    {
        var upper = AnalystToken.ToUpperInvariant(); // payload also uppercased, but role compare uses payload role 'ANALYST'
        // Only the signature hex is case-insensitive; the payload (role) is part of the signed message,
        // so uppercasing the whole token changes the payload and must fail.
        Assert.Null(WpSessionTokens.VerifyRole(upper, Secret, 1000));

        // Uppercasing ONLY the signature half must still validate (Node hex decode is case-insensitive).
        var dot = AnalystToken.IndexOf('.');
        var sigUpper = AnalystToken[..(dot + 1)] + AnalystToken[(dot + 1)..].ToUpperInvariant();
        Assert.Equal("analyst", WpSessionTokens.VerifyRole(sigUpper, Secret, 1000));
    }

    [Fact]
    public void Verify_rejects_tampered_signature()
    {
        var tampered = AnalystToken[..^1] + (AnalystToken[^1] == 'a' ? 'b' : 'a');
        Assert.Null(WpSessionTokens.VerifyRole(tampered, Secret, 1000));
    }

    [Fact]
    public void Verify_rejects_expired_token()
    {
        var token = WpSessionTokens.Create("analyst", Secret, nowUnixSeconds: 1000, maxAgeSeconds: 100);
        Assert.Equal("analyst", WpSessionTokens.VerifyRole(token, Secret, nowUnixSeconds: 1050));
        Assert.Null(WpSessionTokens.VerifyRole(token, Secret, nowUnixSeconds: 2000));
    }

    [Theory]
    [InlineData("")]
    [InlineData("no-dot")]
    [InlineData("too.many.dots")]
    [InlineData("analyst:9999999999.")]
    public void Verify_rejects_malformed_tokens(string token)
    {
        Assert.Null(WpSessionTokens.VerifyRole(token, Secret, 1000));
    }

    [Fact]
    public void Verify_returns_null_when_secret_empty()
    {
        Assert.Null(WpSessionTokens.VerifyRole(AnalystToken, secret: "", nowUnixSeconds: 1000));
    }

    [Fact]
    public void Create_then_verify_roundtrips()
    {
        var token = WpSessionTokens.Create("editor", Secret, nowUnixSeconds: 1000, maxAgeSeconds: 604800);
        Assert.Equal("editor", WpSessionTokens.VerifyRole(token, Secret, nowUnixSeconds: 1000));
    }

    [Theory]
    [InlineData("123abc", 123)]
    [InlineData("  42 ", 42)]
    [InlineData("-5", -5)]
    [InlineData("+7", 7)]
    [InlineData("0", 0)]
    public void JsParseInt_matches_javascript(string input, long expected)
    {
        Assert.Equal(expected, WpSessionTokens.JsParseInt(input));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("+")]
    public void JsParseInt_returns_null_for_nan(string input)
    {
        Assert.Null(WpSessionTokens.JsParseInt(input));
    }
}
