namespace IntegrationsService.Application.Google;

internal static class GoogleOAuthConstants
{
    // State payload keys. Must match the anonymous object property names in
    // GoogleOAuthService.SignState exactly — signing and verification are independent
    // code paths that agree only by convention.
    public const string StatePropertyId = "p";
    public const string StateReturnPath = "r";
    public const string StateExpiry = "e";

    // OAuth wire params.
    public const string GrantTypeAuthorizationCode = "authorization_code";
    public const string ResponseTypeCode = "code";
    public const string AccessTypeOffline = "offline";
    public const string PromptConsent = "consent";
}
