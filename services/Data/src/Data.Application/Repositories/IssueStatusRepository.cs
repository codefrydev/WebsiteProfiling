using Data.Application.Dto.Issues;
using Data.Application.Issues;
using Data.Application.Json;
using Data.Application.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Data.Application.Repositories;

public sealed class IssueStatusRepository(DataDbContext db, NpgsqlDataSource dataSource) : IIssueStatusRepository
{
    private static readonly HashSet<string> ValidStatuses =
        new(StringComparer.Ordinal) { "open", "in_progress", "fixed", "ignored" };

    private const string SelectColumns = """
        id, property_id, report_id, issue_fingerprint, category_id,
        message, url, priority, status, assignee, note, updated_at
        """;

    private const string UpsertSql = $"""
        INSERT INTO issue_status
             (property_id, report_id, issue_fingerprint, category_id, message, url,
              priority, status, assignee, note, updated_at)
           VALUES (@property_id, @report_id, @issue_fingerprint, @category_id, @message, @url,
                   @priority, @status, @assignee, @note, now())
           ON CONFLICT (property_id, issue_fingerprint) DO UPDATE SET
             status     = EXCLUDED.status,
             assignee   = COALESCE(EXCLUDED.assignee, issue_status.assignee),
             note       = COALESCE(EXCLUDED.note, issue_status.note),
             report_id  = COALESCE(EXCLUDED.report_id, issue_status.report_id),
             updated_at = now()
           RETURNING {SelectColumns}
        """;

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

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(UpsertSql, conn);
        cmd.Parameters.AddWithValue("property_id", request.PropertyId);
        cmd.Parameters.AddWithValue("report_id", (object?)request.ReportId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("issue_fingerprint", fingerprint);
        cmd.Parameters.AddWithValue("category_id", (object?)request.CategoryId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("message", message);
        cmd.Parameters.AddWithValue("url", url);
        cmd.Parameters.AddWithValue("priority", priority);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("assignee", (object?)request.Assignee ?? DBNull.Value);
        cmd.Parameters.AddWithValue("note", (object?)request.Note ?? DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new InvalidOperationException("issue status upsert failed");

        return MapReader(reader);
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

    private static IssueStatusRowDto MapReader(NpgsqlDataReader reader)
    {
        var updatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at"));
        var reportOrdinal = reader.GetOrdinal("report_id");
        long? reportId = reader.IsDBNull(reportOrdinal) ? null : reader.GetInt64(reportOrdinal);

        return new IssueStatusRowDto
        {
            Id = reader.GetInt64(reader.GetOrdinal("id")),
            PropertyId = reader.GetInt64(reader.GetOrdinal("property_id")),
            ReportId = reportId,
            IssueFingerprint = reader.GetString(reader.GetOrdinal("issue_fingerprint")),
            CategoryId = reader.IsDBNull(reader.GetOrdinal("category_id"))
                ? null
                : reader.GetString(reader.GetOrdinal("category_id")),
            Message = reader.GetString(reader.GetOrdinal("message")),
            Url = reader.GetString(reader.GetOrdinal("url")),
            Priority = reader.GetString(reader.GetOrdinal("priority")),
            Status = reader.GetString(reader.GetOrdinal("status")),
            Assignee = reader.IsDBNull(reader.GetOrdinal("assignee"))
                ? null
                : reader.GetString(reader.GetOrdinal("assignee")),
            Note = reader.IsDBNull(reader.GetOrdinal("note"))
                ? null
                : reader.GetString(reader.GetOrdinal("note")),
            UpdatedAt = PyIso.Format(updatedAt),
        };
    }
}
