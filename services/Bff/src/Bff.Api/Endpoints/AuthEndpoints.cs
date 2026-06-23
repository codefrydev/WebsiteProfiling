using System.Text;
using Bff.Application.Auth;
using Bff.Application.Options;
using Bff.Domain;
using Microsoft.Extensions.Options;

namespace Bff.Api.Endpoints;

/// <summary>
/// Auth handshake endpoints, moved into the BFF (it now owns setting/verifying the wp_session cookie).
/// Mirrors web/app/api/auth/login + auth/session.
/// </summary>
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", (HttpContext context, IOptions<AuthOptions> authOptions) =>
        {
            var auth = authOptions.Value;
            if (!auth.Enabled)
            {
                return Results.Json(new { ok = true, auth = "disabled" });
            }
            if (!ParseBasicAuth(context, auth))
            {
                return Results.Json(new { error = "Invalid credentials" }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var token = WpSessionTokens.Create(auth.DefaultRole, auth.Secret, now, auth.SessionMaxAgeSeconds);
            SetSessionCookie(context, token, auth);
            return Results.Json(new { ok = true });
        });

        app.MapPost("/api/auth/logout", (HttpContext context, IOptions<AuthOptions> authOptions) =>
        {
            var auth = authOptions.Value;
            context.Response.Cookies.Append(WpSessionTokens.CookieName, string.Empty, new CookieOptions
            {
                HttpOnly = true,
                SameSite = ParseSameSite(auth.CookieSameSite),
                Secure = auth.CookieSecure || ParseSameSite(auth.CookieSameSite) == SameSiteMode.None,
                Path = "/",
                Expires = DateTimeOffset.UnixEpoch,
                Domain = string.IsNullOrEmpty(auth.CookieDomain) ? null : auth.CookieDomain,
            });
            return Results.Json(new { ok = true });
        });

        app.MapGet("/api/auth/session", (HttpContext context, IOptions<AuthOptions> authOptions) =>
        {
            var auth = authOptions.Value;
            var enabled = auth.Enabled;
            var role = enabled
                ? WpSessionTokens.VerifyRole(
                    context.Request.Cookies[WpSessionTokens.CookieName],
                    auth.Secret,
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds())
                : null;
            var effective = role ?? (enabled ? null : Roles.Analyst);
            return Results.Json(new
            {
                authEnabled = enabled,
                authenticated = !enabled || role is not null,
                role = effective,
                canMutate = Roles.CanMutate(effective),
                @readonly = enabled && role is not null && !Roles.CanMutate(role),
            });
        });
    }

    private static bool ParseBasicAuth(HttpContext context, AuthOptions auth)
    {
        if (string.IsNullOrEmpty(auth.BasicPassword))
        {
            return false;
        }
        var header = context.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Basic ", StringComparison.Ordinal))
        {
            return false;
        }
        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..]));
            var idx = decoded.IndexOf(':');
            if (idx < 0)
            {
                return false;
            }
            // Split on the first colon only (RFC 7617: password may contain colons).
            var user = decoded[..idx];
            var pass = decoded[(idx + 1)..];
            return user == auth.BasicUser && pass == auth.BasicPassword;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static void SetSessionCookie(HttpContext context, string token, AuthOptions auth)
    {
        var sameSite = ParseSameSite(auth.CookieSameSite);
        context.Response.Cookies.Append(WpSessionTokens.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = sameSite,
            Secure = auth.CookieSecure || sameSite == SameSiteMode.None,
            Path = "/",
            MaxAge = TimeSpan.FromSeconds(auth.SessionMaxAgeSeconds),
            Domain = string.IsNullOrEmpty(auth.CookieDomain) ? null : auth.CookieDomain,
        });
    }

    private static SameSiteMode ParseSameSite(string value) => value.Trim().ToLowerInvariant() switch
    {
        "none" => SameSiteMode.None,
        "strict" => SameSiteMode.Strict,
        _ => SameSiteMode.Lax,
    };
}
