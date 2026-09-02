using CoreService.Api.Domain.Data.Models;

namespace CoreService.Api.DataApplication.Clients;

public interface IAppSettingsClient
{
    Task<PdfBrandingModel> GetBrandingAsync(bool enabled, CancellationToken cancellationToken = default);
}

public interface ILogoFetcher
{
    Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default);
}
