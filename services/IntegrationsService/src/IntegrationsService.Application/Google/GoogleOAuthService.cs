using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IntegrationsService.Application.Repositories;

namespace IntegrationsService.Application.Google;

public sealed class GoogleOAuthService(
    PropertyRepository properties,
    GoogleAppSettingsRepository appSettings,
    IHttpClientFactory httpClientFactory)
{
    private const string GoogleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string GoogleTokenEndpoint = "https://oauth2.googleapis.com/token";
    private const int StateTtlSeconds = 600;
    private const string DevStateSecret = "google-oauth-dev-state-secret";

    public static string RedirectUri() =>
        (Environment.GetEnvironmentVariable("GOOGLE_REDIRECT_URI")
         ?? "http://localhost:8090/api/integrations/google/callback").Trim();

    public static string AppBase() =>
        (Environment.GetEnvironmentVariable("APP_PUBLIC_URL") ?? "http://localhost:3000").TrimEnd('/');

    public static string SignState(long propertyId, string returnPath, DateTimeOffset? now = null)
    {
        // Property names (p/r/e) are serialized as JSON keys and must match GoogleOAuthConstants
        // exactly — VerifyState below reads them back by those literal names.
        var payload = new
        {
            p = propertyId,
            r = returnPath,
            e = (long)(now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds() + StateTtlSeconds,
        };
        var body = Base64UrlEncode(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
        var sig = ComputeStateSignature(body);
        return $"{body}.{sig}";
    }

    public static Dictionary<string, JsonElement>? VerifyState(string? state, DateTimeOffset? now = null)
    {
        if (string.IsNullOrWhiteSpace(state) || !state.Contains('.', StringComparison.Ordinal))
        {
            return null;
        }

        var dot = state.IndexOf('.', StringComparison.Ordinal);
        var body = state[..dot];
        var sig = state[(dot + 1)..];
        var expected = ComputeStateSignature(body);
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(sig),
                Encoding.ASCII.GetBytes(expected)))
        {
            return null;
        }

        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(body));
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement.Clone();
            if (!root.TryGetProperty(GoogleOAuthConstants.StateExpiry, out var expiry)
                || expiry.GetInt64() < (long)(now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds())
            {
                return null;
            }

            return new Dictionary<string, JsonElement>
            {
                [GoogleOAuthConstants.StatePropertyId] = root.GetProperty(GoogleOAuthConstants.StatePropertyId),
                [GoogleOAuthConstants.StateReturnPath] = root.TryGetProperty(GoogleOAuthConstants.StateReturnPath, out var r) ? r : default,
                [GoogleOAuthConstants.StateExpiry] = expiry,
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string BuildConsentUrl(string clientId, string state)
    {
        var parameters = new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["redirect_uri"] = RedirectUri(),
            ["response_type"] = GoogleOAuthConstants.ResponseTypeCode,
            ["scope"] = string.Join(' ', GoogleAppSettingsRepository.GoogleScopes),
            ["access_type"] = GoogleOAuthConstants.AccessTypeOffline,
            ["prompt"] = GoogleOAuthConstants.PromptConsent,
            ["include_granted_scopes"] = "true",
            ["state"] = state,
        };
        var query = string.Join(
            "&",
            parameters.Select(kvp =>
                $"{Uri.EscapeDataString(kvp.Key)}={Uri.EscapeDataString(kvp.Value)}"));
        return $"{GoogleAuthEndpoint}?{query}";
    }

    public async Task<string?> ExchangeCodeAsync(
        string code,
        string clientId,
        string clientSecret,
        CancellationToken cancellationToken = default)
    {
        var client = httpClientFactory.CreateClient(nameof(GoogleOAuthService));
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["redirect_uri"] = RedirectUri(),
            ["grant_type"] = GoogleOAuthConstants.GrantTypeAuthorizationCode,
        });

        using var response = await client.PostAsync(GoogleTokenEndpoint, content, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return doc.RootElement.TryGetProperty("refresh_token", out var token)
            ? token.GetString()
            : null;
    }

    public async Task<string> OAuthStartAsync(
        long? propertyId,
        string? startUrl,
        string? returnTo,
        CancellationToken cancellationToken = default)
    {
        long? pid = propertyId;
        if (pid is null or <= 0 && !string.IsNullOrWhiteSpace(startUrl))
        {
            pid = await properties.EnsureFromStartUrlAsync(startUrl.Trim(), cancellationToken);
        }

        if (pid is null or <= 0)
        {
            throw new GoogleOAuthException(
                "propertyId is required. Set Site URL and connect from Integrations.");
        }

        var cfg = await appSettings.ReadAsync(cancellationToken);
        var clientId = (cfg.ClientId ?? "").Trim();
        if (string.IsNullOrEmpty(clientId))
        {
            throw new GoogleOAuthException(
                "Google client ID missing. Complete Step 1 in Integrations.");
        }

        var state = SignState(pid.Value, SafeReturnPath(returnTo));
        return BuildConsentUrl(clientId, state);
    }

    public async Task<string> OAuthCallbackAsync(
        string? code,
        string? state,
        string? error,
        CancellationToken cancellationToken = default)
    {
        var payload = VerifyState(state);
        var returnPath = SafeReturnPath(
            payload is not null && payload.TryGetValue(GoogleOAuthConstants.StateReturnPath, out var r) && r.ValueKind == JsonValueKind.String
                ? r.GetString()
                : null);

        if (!string.IsNullOrEmpty(error))
        {
            return UiRedirect(returnPath, new Dictionary<string, string>
            {
                ["integrations"] = "open",
                ["auth"] = "error",
                ["reason"] = error,
            });
        }

        if (payload is null)
        {
            return UiRedirect(returnPath, new Dictionary<string, string>
            {
                ["integrations"] = "open",
                ["auth"] = "error",
                ["reason"] = "Invalid or expired state.",
            });
        }

        if (string.IsNullOrEmpty(code))
        {
            return UiRedirect(returnPath, new Dictionary<string, string>
            {
                ["integrations"] = "open",
                ["auth"] = "error",
                ["reason"] = "No authorization code received.",
            });
        }

        string clientId;
        string clientSecret;
        try
        {
            (clientId, clientSecret) = await appSettings.AppClientCredentialsAsync(cancellationToken);
        }
        catch (InvalidOperationException)
        {
            return UiRedirect(returnPath, new Dictionary<string, string>
            {
                ["integrations"] = "open",
                ["auth"] = "error",
                ["reason"] = "Client credentials missing.",
            });
        }

        var refreshToken = await ExchangeCodeAsync(code, clientId, clientSecret, cancellationToken);
        if (string.IsNullOrEmpty(refreshToken))
        {
            return UiRedirect(returnPath, new Dictionary<string, string>
            {
                ["integrations"] = "open",
                ["auth"] = "error",
                ["reason"] = "Token exchange failed.",
            });
        }

        var propertyId = payload[GoogleOAuthConstants.StatePropertyId].GetInt64();
        await properties.ApplyGoogleCredentialsPatchAsync(
            propertyId,
            new PropertyGoogleCredentialsPatch
            {
                RefreshToken = refreshToken,
                AuthMode = "oauth",
            },
            cancellationToken);

        return UiRedirect(returnPath, new Dictionary<string, string>
        {
            ["integrations"] = "open",
            ["auth"] = "success",
        });
    }

    public static string SafeReturnPath(string? raw)
    {
        if (string.IsNullOrEmpty(raw) || !raw.StartsWith('/') || raw.StartsWith("//", StringComparison.Ordinal))
        {
            return "/";
        }

        return raw;
    }

    public static string UiRedirect(string returnPath, IReadOnlyDictionary<string, string> parameters)
    {
        var sep = returnPath.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        var query = string.Join(
            "&",
            parameters.Select(kvp =>
                $"{Uri.EscapeDataString(kvp.Key)}={Uri.EscapeDataString(kvp.Value)}"));
        return $"{AppBase()}{returnPath}{sep}{query}";
    }

    private static string StateSecret()
    {
        var secret = (Environment.GetEnvironmentVariable("AUTH_SECRET")
            ?? Environment.GetEnvironmentVariable("SESSION_SECRET")
            ?? "").Trim();
        if (!string.IsNullOrEmpty(secret))
        {
            return secret;
        }

        var env = (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "").Trim();
        if (string.Equals(env, "Production", StringComparison.OrdinalIgnoreCase))
        {
            throw new GoogleOAuthException(
                "AUTH_SECRET or SESSION_SECRET is required for Google OAuth in Production.");
        }

        return DevStateSecret;
    }

    private static string ComputeStateSignature(string body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(StateSecret()));
        var hash = hmac.ComputeHash(Encoding.ASCII.GetBytes(body));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string text)
    {
        var pad = new string('=', (-text.Length % 4 + 4) % 4);
        var b64 = text.Replace('-', '+').Replace('_', '/') + pad;
        return Convert.FromBase64String(b64);
    }
}

public sealed class GoogleOAuthException(string message) : Exception(message);
