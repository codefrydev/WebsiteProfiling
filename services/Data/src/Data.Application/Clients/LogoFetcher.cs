using Microsoft.Extensions.Logging;

namespace Data.Application.Clients;

public sealed class LogoFetcher(HttpClient http, ILogger<LogoFetcher> logger) : ILogoFetcher
{
    private const int MaxLogoBytes = 512 * 1024;

    public async Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        if (!OutboundUrlValidator.IsAllowedFetchUrl(url, out var rejectReason))
        {
            logger.LogDebug("Logo URL rejected ({Reason}): {Url}", rejectReason, url);
            return null;
        }

        try
        {
            using var response = await http.GetAsync(url.Trim(), cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length > MaxLogoBytes)
            {
                logger.LogDebug("Logo at {Url} exceeds {MaxBytes} bytes — skipping", url, MaxLogoBytes);
                return null;
            }

            return bytes;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Failed to fetch logo from {Url}", url);
            return null;
        }
    }
}
