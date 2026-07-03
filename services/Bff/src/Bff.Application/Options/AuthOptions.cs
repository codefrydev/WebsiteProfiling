using Bff.Domain;

namespace Bff.Application.Options;

/// <summary>
/// Auth configuration mirroring the TS env contract (web/src/server/auth.ts):
/// AUTH_SECRET / SESSION_SECRET, AUTH_USER, AUTH_PASSWORD, AUTH_DEFAULT_ROLE.
/// When <see cref="Secret"/> is empty, auth is disabled (everything is permitted),
/// matching TS authEnabled() === false.
/// </summary>
public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>HMAC signing secret. Empty = auth disabled.</summary>
    public string Secret { get; set; } = string.Empty;

    /// <summary>Basic-auth username for login (TS AUTH_USER, default "admin").</summary>
    public string BasicUser { get; set; } = Roles.Admin;

    /// <summary>Basic-auth password for login (TS AUTH_PASSWORD). Empty = basic login unavailable.</summary>
    public string BasicPassword { get; set; } = string.Empty;

    /// <summary>Role granted on successful login (TS AUTH_DEFAULT_ROLE, default "analyst").</summary>
    public string DefaultRole { get; set; } = Roles.Analyst;

    /// <summary>Session lifetime in seconds (TS SESSION_MAX_AGE_S = 7 days).</summary>
    public int SessionMaxAgeSeconds { get; set; } = 60 * 60 * 24 * 7;

    /// <summary>
    /// Cookie SameSite mode for the wp_session cookie. Dev (same-site localhost): "Lax".
    /// Cross-site prod (frontend + BFF on a shared parent domain over HTTPS): "None".
    /// </summary>
    public string CookieSameSite { get; set; } = "Lax";

    /// <summary>Set the Secure flag on the cookie. Required when CookieSameSite = None.</summary>
    public bool CookieSecure { get; set; }

    /// <summary>Optional cookie Domain (e.g. ".example.com") for cross-subdomain prod. Empty = host-only.</summary>
    public string CookieDomain { get; set; } = string.Empty;

    public bool Enabled => !string.IsNullOrEmpty(Secret);
}
