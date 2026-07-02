using Data.Domain.Models;

namespace Data.Application.Clients;

public interface IAppSettingsClient
{
    Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default);
}

public interface ILogoFetcher
{
    Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default);
}
