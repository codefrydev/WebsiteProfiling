using Data.Application.Dto.Issues;
using Data.Application.Issues;
using Data.Application.Json;
using Data.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Data.Application.Repositories;

public sealed class IssueStatusRepository(DataDbContext db) : IIssueStatusRepository
{
    private static readonly HashSet<string> ValidStatuses =
        new(StringComparer.Ordinal) { "open", "in_progress", "fixed", "ignored" };

    public async Task<IReadOnlyList<IssueStatusRowDto>> ListAsync(
        int propertyId, CancellationToken cancellationToken)
    {
        var rows = await db.Set<Data.Domain.Entities.IssueStatus>()
            .AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync(cancellationToken);

        return rows.Select(MapEntity).ToList();
    }

    public async Task<IssueStatusRowDto> UpsertAsync(
        UpsertIssueStatusRequest request, CancellationToken cancellationToken)
    {
        var status = request.Status ?? string.Empty;
        if (!ValidStatuses.Contains(status))
            throw new ArgumentException($"invalid status: {status}");

        var message = request.Message ?? string.Empty;
        var url = request.Url ?? string.Empty;
        var priority = request.Priority ?? "Medium";
        var fingerprint = IssueStatusFingerprint.Compute(message, url, request.CategoryId);

        var existing = await db.Set<Data.Domain.Entities.IssueStatus>()
            .AsTracking()
            .FirstOrDefaultAsync(
                x => x.PropertyId == request.PropertyId && x.IssueFingerprint == fingerprint,
                cancellationToken);

        if (existing is null)
        {
            var row = new Data.Domain.Entities.IssueStatus
            {
                PropertyId = request.PropertyId,
                ReportId = request.ReportId,
                IssueFingerprint = fingerprint,
                CategoryId = request.CategoryId,
                Message = message,
                Url = url,
                Priority = priority,
                Status = status,
                Assignee = request.Assignee,
                Note = request.Note,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Set<Data.Domain.Entities.IssueStatus>().Add(row);
            await db.SaveChangesAsync(cancellationToken);
            return MapEntity(row);
        }

        existing.Status = status;
        existing.Assignee = request.Assignee ?? existing.Assignee;
        existing.Note = request.Note ?? existing.Note;
        existing.ReportId = request.ReportId ?? existing.ReportId;
        existing.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return MapEntity(existing);
    }

    private static IssueStatusRowDto MapEntity(Data.Domain.Entities.IssueStatus row) => new()
    {
        Id = row.Id,
        PropertyId = row.PropertyId,
        ReportId = row.ReportId,
        IssueFingerprint = row.IssueFingerprint,
        CategoryId = row.CategoryId,
        Message = row.Message,
        Url = row.Url,
        Priority = row.Priority,
        Status = row.Status,
        Assignee = row.Assignee,
        Note = row.Note,
        UpdatedAt = PyIso.Format(row.UpdatedAt),
    };
}
