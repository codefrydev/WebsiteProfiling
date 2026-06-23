namespace Bff.Application.Options;

/// <summary>
/// Credentialed-CORS configuration. The browser calls the BFF cross-origin, so we must
/// echo an explicit allow-list of origins (never a wildcard with credentials).
/// Env override: BFF_ALLOWED_ORIGINS (comma-separated), mirroring FASTAPI_ALLOWED_ORIGINS.
/// </summary>
public sealed class BffCorsOptions
{
    public const string SectionName = "Cors";

    public string[] AllowedOrigins { get; set; } = [];
}
