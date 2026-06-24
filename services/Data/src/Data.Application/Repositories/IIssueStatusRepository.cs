using Data.Application.Dto.Issues;

namespace Data.Application.Repositories;

public interface IIssueStatusRepository
{
    Task<IReadOnlyList<IssueStatusRowDto>> ListAsync(int propertyId, CancellationToken cancellationToken);

    Task<IssueStatusRowDto> UpsertAsync(UpsertIssueStatusRequest request, CancellationToken cancellationToken);
}
