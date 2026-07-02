using System.Collections.Concurrent;
using System.Diagnostics;

namespace ReportService.Application.Pipeline;

/// <summary>
/// Tracks live pipeline subprocess handles so cancel can kill Python even when the worker poll loop is stuck.
/// </summary>
internal static class PipelineProcessRegistry
{
    private static readonly ConcurrentDictionary<string, Process> Processes = new(StringComparer.Ordinal);

    public static void Register(string jobId, Process process)
    {
        if (string.IsNullOrWhiteSpace(jobId))
        {
            return;
        }

        Processes[jobId] = process;
    }

    /// <summary>
    /// Sole disposal point. Must be called exactly once by the owning worker loop
    /// (<see cref="PipelineJobRunner"/>'s finally), after it is completely done reading Process
    /// state (HasExited/ExitCode/etc). <see cref="TryKill"/> never disposes, so this is safe even
    /// if TryKill executed concurrently on another thread at any point.
    /// </summary>
    public static void Unregister(string jobId)
    {
        if (string.IsNullOrWhiteSpace(jobId))
        {
            return;
        }

        if (Processes.TryRemove(jobId, out var process))
        {
            try
            {
                process.Dispose();
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }

    /// <summary>
    /// Best-effort kill only — NEVER disposes and NEVER removes the registry entry (that's
    /// Unregister's job, owned by the worker loop). Safe to call at any time, concurrently with
    /// the worker loop still using the same Process instance.
    /// </summary>
    public static bool TryKill(string jobId)
    {
        if (!Processes.TryGetValue(jobId, out var process))
        {
            return false;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }

            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
