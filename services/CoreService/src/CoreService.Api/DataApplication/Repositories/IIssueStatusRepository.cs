using CoreService.Api.DataApplication.Dto.Issues;

namespace CoreService.Api.DataApplication.Repositories;

public interface IIssueStatusRepository
{
    Task<IReadOnlyList<IssueStatusRowDto>> ListAsync(int propertyId, CancellationToken cancellationToken);

    Task<IssueStatusRowDto> UpsertAsync(UpsertIssueStatusRequest request, CancellationToken cancellationToken);
}
