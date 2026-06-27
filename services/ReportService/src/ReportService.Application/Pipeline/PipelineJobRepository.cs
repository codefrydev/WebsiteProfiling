using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ReportService.Application.Persistence;
using ReportService.Application.Pipeline.Models;
using ReportService.Domain.Entities;

namespace ReportService.Application.Pipeline;

public sealed class PipelineJobRepository(
    IDbContextFactory<ReportDbContext> dbFactory,
    NpgsqlDataSource dataSource)
{
    public const int LogMaxChars = 256_000;
    public const int LogTrimChars = 200_000;

    public async Task<bool> EnqueueAsync(
        string jobId,
        string jobType,
        string? command,
        long? propertyId,
        string? configHash = null,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        await ReconcileStaleJobsAsync(db, cancellationToken);

        var id = Guid.Parse(jobId);
        var inserted = (await db.Database
            .SqlQuery<InsertedJobRow>(
                $"""
                 INSERT INTO pipeline_jobs (id, job_type, status, command, property_id, config_hash)
                 SELECT {id}, {jobType}, 'pending', {command}, {propertyId}, {configHash}
                 WHERE NOT EXISTS (
                     SELECT 1 FROM pipeline_jobs WHERE status IN ('pending', 'running')
                 )
                 RETURNING id AS "Id"
                 """)
            .ToListAsync(cancellationToken))
            .FirstOrDefault();

        return inserted is not null;
    }

    public async Task<ClaimedPipelineJob?> TryClaimPendingJobAsync(
        int workerPid,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        await ReconcileOrphanedRunningJobsAsync(db, cancellationToken);
        var claimed = (await db.Database
            .SqlQuery<ClaimedJobRow>(
                $"""
                 UPDATE pipeline_jobs
                 SET status = 'running', worker_pid = {workerPid}
                 WHERE id = (
                     SELECT id FROM pipeline_jobs
                     WHERE status = 'pending'
                     ORDER BY started_at ASC
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED
                 )
                 RETURNING id AS "Id", job_type AS "JobType", command AS "Command", property_id AS "PropertyId"
                 """)
            .ToListAsync(cancellationToken))
            .FirstOrDefault();

        return claimed is null
            ? null
            : new ClaimedPipelineJob
            {
                Id = claimed.Id.ToString(),
                JobType = claimed.JobType ?? "",
                Command = claimed.Command,
                PropertyId = claimed.PropertyId,
            };
    }

    /// <summary>
    /// Append log output using a dedicated connection + row lock (safe for concurrent stdout/stderr pumps).
    /// </summary>
    public async Task<bool> AppendLogAsync(
        string jobId,
        string chunk,
        CancellationToken cancellationToken = default)
    {
        var id = Guid.Parse(jobId);
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var tx = await conn.BeginTransactionAsync(cancellationToken);

        await using (var selectCmd = new NpgsqlCommand(
                         """
                         SELECT log_text, log_truncated
                         FROM pipeline_jobs
                         WHERE id = @id
                         FOR UPDATE
                         """,
                         conn,
                         tx))
        {
            selectCmd.Parameters.AddWithValue("id", id);
            await using var reader = await selectCmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await tx.RollbackAsync(cancellationToken);
                return false;
            }

            var existing = reader.IsDBNull(0) ? "" : reader.GetString(0);
            var wasTruncated = !reader.IsDBNull(1) && reader.GetBoolean(1);
            var (combined, truncatedNow) = TrimLog(existing, chunk);
            var logTruncated = wasTruncated || truncatedNow;

            await reader.CloseAsync();

            await using var updateCmd = new NpgsqlCommand(
                """
                UPDATE pipeline_jobs
                SET log_text = @log, log_truncated = @truncated
                WHERE id = @id
                """,
                conn,
                tx);
            updateCmd.Parameters.AddWithValue("log", combined);
            updateCmd.Parameters.AddWithValue("truncated", logTruncated);
            updateCmd.Parameters.AddWithValue("id", id);
            await updateCmd.ExecuteNonQueryAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            return logTruncated;
        }
    }

    public Task FinishAsync(
        string jobId,
        string status,
        int? exitCode,
        string? error = null,
        bool? logTruncated = null,
        CancellationToken cancellationToken = default) =>
        TryFinishAsync(jobId, status, exitCode, error, logTruncated, cancellationToken);

    public async Task<bool> TryFinishAsync(
        string jobId,
        string status,
        int? exitCode,
        string? error = null,
        bool? logTruncated = null,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        var query = db.PipelineJobs.Where(j => j.Id == id && (j.Status == "pending" || j.Status == "running"));

        var updated = logTruncated is null
            ? await query.ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(j => j.Status, status)
                    .SetProperty(j => j.ExitCode, exitCode)
                    .SetProperty(j => j.ErrorText, error)
                    .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow)
                    .SetProperty(j => j.WorkerPid, (int?)null),
                cancellationToken)
            : await query.ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(j => j.Status, status)
                    .SetProperty(j => j.ExitCode, exitCode)
                    .SetProperty(j => j.ErrorText, error)
                    .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow)
                    .SetProperty(j => j.LogTruncated, logTruncated.Value)
                    .SetProperty(j => j.WorkerPid, (int?)null),
                cancellationToken);

        return updated > 0;
    }

    public async Task<bool> IsActiveAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        return await db.PipelineJobs.AnyAsync(
            j => j.Id == id && (j.Status == "pending" || j.Status == "running"),
            cancellationToken);
    }

    public async Task<bool> CancelJobAsync(
        string jobId,
        string message = "Cancelled by user",
        CancellationToken cancellationToken = default)
    {
        var job = await GetAsync(jobId, cancellationToken);
        if (job is null || job.Status is not ("pending" or "running"))
        {
            return false;
        }

        PipelineProcessRegistry.TryKill(jobId);
        return await ForceCancelAsync(jobId, message, cancellationToken);
    }

    public async Task<bool> ForceCancelAsync(
        string jobId,
        string message = "Cancelled by user",
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        var updated = await db.PipelineJobs
            .Where(j => j.Id == id && (j.Status == "pending" || j.Status == "running"))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(j => j.Status, "error")
                    .SetProperty(j => j.ExitCode, -1)
                    .SetProperty(j => j.ErrorText, message)
                    .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow)
                    .SetProperty(j => j.WorkerPid, (int?)null)
                    .SetProperty(j => j.CancelRequested, true),
                cancellationToken);

        return updated > 0;
    }

    public async Task<(bool Cancel, bool Pause)> CheckFlagsAsync(
        string jobId,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        var flags = await db.PipelineJobs
            .Where(j => j.Id == id)
            .Select(j => new { j.CancelRequested, j.PauseRequested })
            .FirstOrDefaultAsync(cancellationToken);

        return flags is null ? (false, false) : (flags.CancelRequested, flags.PauseRequested);
    }

    public Task<bool> SetCancelFlagAsync(string jobId, CancellationToken cancellationToken = default) =>
        CancelJobAsync(jobId, cancellationToken: cancellationToken);

    public async Task<bool> SetPauseFlagAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        return await db.PipelineJobs
            .Where(j => j.Id == id && j.Status == "running")
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(j => j.PauseRequested, true),
                cancellationToken) > 0;
    }

    public async Task<int> ReconcileStaleJobsAsync(CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        return await ReconcileStaleJobsAsync(db, cancellationToken);
    }

    public async Task<PipelineJobRecord?> GetAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        var job = await db.PipelineJobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);
        return job is null ? null : ToRecord(job);
    }

    public async Task<IReadOnlyList<PipelineJobRecord>> ListAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var jobs = await db.PipelineJobs
            .OrderByDescending(j => j.StartedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return jobs.Select(ToRecord).ToList();
    }

    public async Task<PipelineJobRecord?> GetActiveAsync(CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var job = await db.PipelineJobs
            .Where(j => j.Status == "pending" || j.Status == "running")
            .OrderByDescending(j => j.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return job is null ? null : ToRecord(job);
    }

    public async Task<bool> GetLogTruncatedAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var id = Guid.Parse(jobId);
        return await db.PipelineJobs
            .Where(j => j.Id == id)
            .Select(j => j.LogTruncated)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public object JobToApiObject(PipelineJobRecord job) =>
        new
        {
            id = job.Id,
            jobType = job.JobType,
            status = job.Status,
            exitCode = job.ExitCode,
            log = job.Log,
            error = job.Error,
            logTruncated = job.LogTruncated,
            propertyId = job.PropertyId,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
            command = job.Command,
        };

    public object JobStatusToApiObject(PipelineJobRecord job) =>
        new
        {
            status = job.Status,
            exitCode = job.ExitCode,
            log = job.Log,
            error = job.Error,
            logTruncated = job.LogTruncated,
        };

    private static (string Combined, bool Truncated) TrimLog(string existing, string chunk)
    {
        var combined = existing + chunk;
        if (combined.Length <= LogMaxChars)
        {
            return (combined, false);
        }

        return (combined[^LogTrimChars..], true);
    }

    private static async Task<int> ReconcileStaleJobsAsync(
        ReportDbContext db,
        CancellationToken cancellationToken)
    {
        var staleRunningHours = int.TryParse(
            Environment.GetEnvironmentVariable("PIPELINE_JOB_STALE_HOURS"),
            out var rh)
            ? rh
            : 1;
        var stalePendingMinutes = int.TryParse(
            Environment.GetEnvironmentVariable("PIPELINE_JOB_STALE_PENDING_MINUTES"),
            out var pm)
            ? pm
            : 10;

        var runningCutoff = DateTimeOffset.UtcNow.AddHours(-staleRunningHours);
        var runningCount = await db.PipelineJobs
            .Where(j => j.Status == "running" && j.StartedAt < runningCutoff)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        j => j.Status,
                        "error")
                    .SetProperty(
                        j => j.ErrorText,
                        j => j.ErrorText ?? "Job interrupted (server restart or timeout)")
                    .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow),
                cancellationToken);

        var pendingCutoff = DateTimeOffset.UtcNow.AddMinutes(-stalePendingMinutes);
        var pendingCount = await db.PipelineJobs
            .Where(j => j.Status == "pending" && j.StartedAt < pendingCutoff)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(j => j.Status, "error")
                    .SetProperty(j => j.ErrorText, "Job never started (worker restart)")
                    .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow),
                cancellationToken);

        return runningCount + pendingCount;
    }

    private static async Task ReconcileOrphanedRunningJobsAsync(
        ReportDbContext db,
        CancellationToken cancellationToken)
    {
        var running = await db.PipelineJobs
            .Where(j => j.Status == "running" && j.WorkerPid != null)
            .Select(j => new { j.Id, j.WorkerPid })
            .ToListAsync(cancellationToken);

        foreach (var job in running)
        {
            if (IsProcessAlive(job.WorkerPid!.Value))
            {
                continue;
            }

            await db.PipelineJobs
                .Where(j => j.Id == job.Id)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(j => j.Status, "error")
                        .SetProperty(
                            j => j.ErrorText,
                            j => j.ErrorText ?? "Job interrupted (worker no longer running)")
                        .SetProperty(j => j.FinishedAt, DateTimeOffset.UtcNow)
                        .SetProperty(j => j.WorkerPid, (int?)null),
                    cancellationToken);
        }
    }

    private static bool IsProcessAlive(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static PipelineJobRecord ToRecord(PipelineJob job) =>
        new()
        {
            Id = job.Id.ToString(),
            JobType = job.JobType,
            Status = job.Status,
            ExitCode = job.ExitCode,
            Log = job.LogText,
            Error = job.ErrorText,
            LogTruncated = job.LogTruncated,
            PropertyId = job.PropertyId,
            StartedAt = job.StartedAt.ToUniversalTime().ToString("O"),
            FinishedAt = job.FinishedAt?.ToUniversalTime().ToString("O"),
            Command = job.Command,
        };

    private sealed record InsertedJobRow
    {
        public Guid Id { get; init; }
    }

    private sealed record ClaimedJobRow
    {
        public Guid Id { get; init; }

        public string? JobType { get; init; }

        public string? Command { get; init; }

        public long? PropertyId { get; init; }
    }
}
