using CoreService.Api.DataApplication.Repositories;
using CoreService.Api.Domain.Data.Models;

namespace CoreService.Api.DataApplication.Clients;

public sealed class AppSettingsClient(
    IUiPreferencesRepository uiPreferences,
    ILogoFetcher logoFetcher,
    ILogger<AppSettingsClient> logger) : IAppSettingsClient
{
    public async Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default)
    {
        if (!enabled)
        {
            return new PdfBrandingModel { Enabled = false };
        }

        string? name = null;
        string? subtitle = null;
        string? logoUrl = null;

        try
        {
            var prefs = await uiPreferences.GetAsync(cancellationToken);
            name = prefs.BrandName?.Trim();
            subtitle = prefs.BrandSubtitle?.Trim();
            logoUrl = prefs.BrandLogoUrl?.Trim();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to load ui preferences for PDF branding");
        }

        byte[]? logoBytes = null;
        if (!string.IsNullOrWhiteSpace(logoUrl))
        {
            logoBytes = await logoFetcher.FetchAsync(logoUrl, cancellationToken);
        }

        return new PdfBrandingModel
        {
            Enabled = true,
            AgencyName = name ?? "",
            AgencySubtitle = subtitle ?? "",
            LogoBytes = logoBytes,
        };
    }
}
