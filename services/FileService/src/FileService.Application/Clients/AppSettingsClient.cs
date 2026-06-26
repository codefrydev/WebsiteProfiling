using System.Net.Http.Json;
using FileService.Application.Options;
using FileService.Domain.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FileService.Application.Clients;

public sealed class AppSettingsClient : IAppSettingsClient
{
    private readonly HttpClient _http;
    private readonly ILogoFetcher _logoFetcher;
    private readonly ILogger<AppSettingsClient> _logger;

    public AppSettingsClient(
        HttpClient http,
        IOptions<ReportApiOptions> options,
        ILogoFetcher logoFetcher,
        ILogger<AppSettingsClient> logger)
    {
        _http = http;
        _logoFetcher = logoFetcher;
        _logger = logger;
        _http.BaseAddress = new Uri(options.Value.BaseUrl.TrimEnd('/') + "/");
    }

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
            using var response = await _http.GetAsync("api/ui-preferences", cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadFromJsonAsync<UiPreferencesResponse>(cancellationToken);
                name = data?.BrandName?.Trim();
                subtitle = data?.BrandSubtitle?.Trim();
                logoUrl = data?.BrandLogoUrl?.Trim();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load ui preferences for PDF branding");
        }

        byte[]? logoBytes = null;
        if (!string.IsNullOrWhiteSpace(logoUrl))
        {
            logoBytes = await _logoFetcher.FetchAsync(logoUrl, cancellationToken);
        }

        return new PdfBrandingModel
        {
            Enabled = true,
            AgencyName = name ?? "",
            AgencySubtitle = subtitle ?? "",
            LogoBytes = logoBytes,
        };
    }

    private sealed class UiPreferencesResponse
    {
        public string? BrandName { get; set; }

        public string? BrandSubtitle { get; set; }

        public string? BrandLogoUrl { get; set; }
    }
}

public sealed class LogoFetcher : ILogoFetcher
{
    private const int MaxBytes = 512 * 1024;
    private readonly HttpClient _http;
    private readonly ILogger<LogoFetcher> _logger;

    public LogoFetcher(HttpClient http, ILogger<LogoFetcher> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(8));
            using var response = await _http.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }
            var bytes = await response.Content.ReadAsByteArrayAsync(cts.Token);
            return bytes.Length > MaxBytes ? null : bytes;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Logo fetch failed for {Url}", url);
            return null;
        }
    }
}
