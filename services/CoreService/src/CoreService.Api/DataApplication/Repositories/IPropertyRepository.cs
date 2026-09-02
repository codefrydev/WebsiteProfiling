namespace CoreService.Api.DataApplication.Repositories;

public interface IPropertyRepository
{
    /// <summary>Resolve property id from domain slug (tries domain and www. variant).</summary>
    Task<long?> ResolvePropertyIdByDomainAsync(string? domainRaw, CancellationToken cancellationToken = default);
}
