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

    public static void Unregister(string jobId)
    {
        if (string.IsNullOrWhiteSpace(jobId))
        {
            return;
        }

        Processes.TryRemove(jobId, out _);
    }

    public static bool TryKill(string jobId)
    {
        if (!Processes.TryRemove(jobId, out var process))
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
        finally
        {
            process.Dispose();
        }
    }
}
