using System.Security.Claims;
using System.Text.Encodings.Web;
using Bff.Application.Auth;
using Bff.Application.Options;
using Bff.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Bff.Api.Auth;

public static class WpSessionDefaults
{
    public const string Scheme = "WpSession";
    public const string AuthDisabledClaim = "wp:auth_disabled";
}

/// <summary>
/// Authenticates requests from the wp_session cookie (verified byte-compatibly with auth.ts).
/// When auth is disabled (no AUTH_SECRET), every request is authenticated as the default role,
/// mirroring the TS behaviour where authEnabled() === false permits everything.
/// </summary>
public sealed class WpSessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly AuthOptions _auth;

    public WpSessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IOptions<AuthOptions> auth)
        : base(options, logger, encoder)
    {
        _auth = auth.Value;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!_auth.Enabled)
        {
            return Task.FromResult(AuthenticateResult.Success(BuildTicket(_auth.DefaultRole, authDisabled: true)));
        }

        var cookie = Request.Cookies[WpSessionTokens.CookieName];
        var role = WpSessionTokens.VerifyRole(cookie, _auth.Secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        if (string.IsNullOrEmpty(role))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }
        return Task.FromResult(AuthenticateResult.Success(BuildTicket(role, authDisabled: false)));
    }

    private AuthenticationTicket BuildTicket(string role, bool authDisabled)
    {
        var claims = new List<Claim> { new(ClaimTypes.Role, role) };
        if (authDisabled)
        {
            claims.Add(new Claim(WpSessionDefaults.AuthDisabledClaim, "true"));
        }
        var identity = new ClaimsIdentity(claims, WpSessionDefaults.Scheme);
        var principal = new ClaimsPrincipal(identity);
        return new AuthenticationTicket(principal, WpSessionDefaults.Scheme);
    }
}
