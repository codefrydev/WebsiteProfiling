using CoreService.Api.DataApplication.Dto.Issues;
using CoreService.Api.DataApplication.Issues;
using CoreService.Api.DataApplication.Json;
using CoreService.Api.DataApplication.Persistence;
using CoreService.Api.Domain.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.DataApplication.Repositories;

public sealed class IssueStatusRepository(DataDbContext db) : IIssueStatusRepository
{
    private static readonly HashSet<string> ValidStatuses =
        new(StringComparer.Ordinal) { "open", "in_progress", "fixed", "ignored" };

    public async Task<IReadOnlyList<IssueStatusRowDto>> ListAsync(
        int propertyId, CancellationToken cancellationToken)
    {
        var rows = await db.Set<IssueStatus>()
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

        var existing = await db.Set<IssueStatus>()
            .AsTracking()
            .FirstOrDefaultAsync(
                x => x.PropertyId == request.PropertyId && x.IssueFingerprint == fingerprint,
                cancellationToken);

        if (existing is null)
        {
            var row = new IssueStatus
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
            db.Set<IssueStatus>().Add(row);
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

    private static IssueStatusRowDto MapEntity(IssueStatus row) => new()
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
