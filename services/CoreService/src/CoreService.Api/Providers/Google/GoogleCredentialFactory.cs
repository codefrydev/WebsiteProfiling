using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Repositories;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Http;

namespace CoreService.Api.Providers.Google;

public sealed class GoogleCredentialFactory(
    PropertyRepository properties,
    GoogleAppSettingsRepository appSettings) : IGoogleCredentialFactory
{
    public async Task<IConfigurableHttpClientInitializer> BuildCredentialsAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken)
            ?? throw new InvalidOperationException($"Property id {propertyId} not found.");

        var token = (prop.GoogleRefreshToken ?? "").Trim();
        var authMode = prop.GoogleAuthMode;
        var domain = prop.CanonicalDomain ?? "this site";

        if (authMode == "service_account" || (string.IsNullOrEmpty(token) && await appSettings.HasServiceAccountAsync(cancellationToken)))
        {
            return await BuildServiceAccountCredentialsAsync(cancellationToken);
        }

        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException(
                $"Google not connected for {domain}. "
                + "Set Site URL, open Integrations, and click Connect with Google for this site, "
                + "or upload an app-wide service account JSON in Integrations.");
        }

        var (clientId, clientSecret) = await appSettings.AppClientCredentialsAsync(cancellationToken);
        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets
            {
                ClientId = clientId,
                ClientSecret = clientSecret,
            },
            Scopes = GoogleAppSettingsRepository.GoogleScopes,
        });

        var credential = new UserCredential(
            flow,
            propertyId.ToString(),
            new TokenResponse { RefreshToken = token });

        bool refreshed;
        try
        {
            refreshed = await credential.RefreshTokenAsync(cancellationToken);
        }
        catch (TokenResponseException ex) when (ex.Error?.Error == "invalid_grant")
        {
            await properties.DisconnectGoogleAsync(propertyId, cancellationToken);
            throw new InvalidOperationException(
                "Google connection expired — reconnect Google for this site.");
        }
        catch (TokenResponseException)
        {
            throw new InvalidOperationException(
                "Google connection expired — reconnect Google for this site.");
        }

        if (!refreshed)
        {
            throw new InvalidOperationException(
                "Google connection expired — reconnect Google for this site.");
        }

        return credential;
    }

    private async Task<IConfigurableHttpClientInitializer> BuildServiceAccountCredentialsAsync(
        CancellationToken cancellationToken)
    {
        using var saDoc = await appSettings.ReadServiceAccountJsonAsync(cancellationToken)
            ?? throw new InvalidOperationException("No service account configured in google_app_settings.");

        return GoogleCredential.FromJson(saDoc.RootElement.GetRawText())
            .CreateScoped(GoogleAppSettingsRepository.GoogleScopes);
    }
}
