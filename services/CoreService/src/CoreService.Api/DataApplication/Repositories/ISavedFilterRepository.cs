using System.Text.Json;
using CoreService.Api.DataApplication.Dto.Filters;

namespace CoreService.Api.DataApplication.Repositories;

public interface ISavedFilterRepository
{
    Task<IReadOnlyList<SavedFilterRowDto>> ListAsync(int propertyId, CancellationToken cancellationToken);

    Task UpsertAsync(long propertyId, string name, JsonElement filterJson, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(long propertyId, string name, CancellationToken cancellationToken);
}
