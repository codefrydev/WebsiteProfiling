using FileService.Domain.Models;

namespace FileService.Application.Clients;

public interface IAppSettingsClient
{
    Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default);
}

public interface ILogoFetcher
{
    Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default);
}
