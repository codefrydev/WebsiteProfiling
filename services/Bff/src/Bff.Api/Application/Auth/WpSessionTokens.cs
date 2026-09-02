using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Bff.Api.Application.Auth;

/// <summary>
/// Create/verify the wp_session token, byte-for-byte compatible with the TypeScript
/// implementation in web/src/server/auth.ts. Compatibility is load-bearing: existing
/// sessions must survive the big-bang cutover, so any behavioural divergence (hex casing,
/// exp parsing, dot-splitting) would silently invalidate live cookies.
///
/// Token format: "{role}:{exp}.{hmacSha256Hex(secret, "{role}:{exp}")}"
/// - hex is lowercase on creation, but verification is case-insensitive (Node Buffer.from
///   hex decoding is case-insensitive, so we decode bytes and compare).
/// - exp is parsed JS-parseInt style (leading numeric prefix), NOT strict integer parsing.
/// </summary>
public static class WpSessionTokens
{
    public const string CookieName = "wp_session";

    /// <summary>HMAC-SHA256(secret, payload) as lowercase hex. Mirrors TS signToken().</summary>
    public static string Sign(string payload, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexStringLower(hash);
    }

    /// <summary>Mirrors TS createSessionToken(): "{role}:{exp}.{sig}". Returns "" if no secret.</summary>
    public static string Create(string role, string secret, long nowUnixSeconds, int maxAgeSeconds)
    {
        if (string.IsNullOrEmpty(secret))
        {
            return string.Empty;
        }
        var exp = nowUnixSeconds + maxAgeSeconds;
        var payload = $"{role}:{exp}";
        return $"{payload}.{Sign(payload, secret)}";
    }

    /// <summary>
    /// Mirrors TS verifySessionToken(): returns the role if the token is valid and unexpired,
    /// otherwise null. Returns null when the secret is empty (auth disabled is handled upstream).
    /// </summary>
    public static string? VerifyRole(string? token, string secret, long nowUnixSeconds)
    {
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(secret))
        {
            return null;
        }

        // TS: token.split('.') must yield exactly 2 parts.
        var parts = token.Split('.');
        if (parts.Length != 2)
        {
            return null;
        }

        var payload = parts[0];
        var sig = parts[1];
        var expectedHex = Sign(payload, secret);

        // TS compares decoded HMAC bytes with timingSafeEqual (and returns null on length mismatch).
        // Node's hex decode is case-insensitive, so decode both and fixed-time compare the bytes.
        byte[] sigBytes;
        byte[] expectedBytes;
        try
        {
            sigBytes = Convert.FromHexString(sig);
            expectedBytes = Convert.FromHexString(expectedHex);
        }
        catch (FormatException)
        {
            return null;
        }
        if (sigBytes.Length != expectedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(sigBytes, expectedBytes))
        {
            return null;
        }

        // TS: const [role, expStr] = payload.split(':');
        var seg = payload.Split(':');
        var role = seg.Length > 0 ? seg[0] : null;
        var expStr = seg.Length > 1 ? seg[1] : null;

        // TS: const exp = parseInt(expStr || '0', 10);  (NaN if no leading digits)
        var exp = JsParseInt(string.IsNullOrEmpty(expStr) ? "0" : expStr);

        // TS: if (!role || !Number.isFinite(exp) || exp < now) return null;
        if (string.IsNullOrEmpty(role) || exp is null || exp.Value < nowUnixSeconds)
        {
            return null;
        }
        return role;
    }

    /// <summary>
    /// JavaScript parseInt(str, 10) semantics: skip leading whitespace, optional sign, then
    /// consume the leading run of decimal digits; ignore trailing garbage. Returns null for NaN
    /// (no digits) — the .NET stand-in for !Number.isFinite. This is the off-by-one fix called out
    /// in the plan: long.TryParse("123abc") fails, but JS parseInt("123abc") === 123.
    /// </summary>
    public static long? JsParseInt(string? input)
    {
        if (input is null)
        {
            return null;
        }

        var i = 0;
        var n = input.Length;
        while (i < n && char.IsWhiteSpace(input[i]))
        {
            i++;
        }

        var sign = 1L;
        if (i < n && (input[i] == '+' || input[i] == '-'))
        {
            if (input[i] == '-')
            {
                sign = -1L;
            }
            i++;
        }

        var start = i;
        while (i < n && input[i] >= '0' && input[i] <= '9')
        {
            i++;
        }
        if (i == start)
        {
            return null; // no digits -> NaN
        }

        var digits = input.Substring(start, i - start);
        // Guard against absurdly long digit runs overflowing long; JS would keep precision as
        // a double, but exp values here are 10-digit unix seconds, so long is sufficient.
        if (!long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var value))
        {
            return long.MaxValue * sign; // overflow -> treat as a finite, far-future/past value
        }
        return sign * value;
    }
}
