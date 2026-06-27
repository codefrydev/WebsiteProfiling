namespace AiService.Application.Chat;

/// <summary>
/// Bounded parallel tool dispatch (ports Python <c>website_profiling.concurrency.tool_concurrency</c>).
/// </summary>
public static class ToolConcurrency
{
    public const int DefaultMaxWorkers = 6;

    public static int ResolveMaxWorkers(int? overrideValue = null)
    {
        if (overrideValue is int explicitValue && explicitValue > 0)
        {
            return explicitValue;
        }

        var raw = Environment.GetEnvironmentVariable("WP_TOOL_CONCURRENCY")?.Trim();
        if (int.TryParse(raw, out var parsed) && parsed > 0)
        {
            return parsed;
        }

        return DefaultMaxWorkers;
    }

    /// <summary>
    /// Runs async work items with bounded concurrency, preserving input order in results.
    /// </summary>
    public static async Task<IReadOnlyList<T>> MapParallelAsync<T>(
        IReadOnlyList<Func<Task<T>>> tasks,
        int maxWorkers,
        CancellationToken cancellationToken = default)
    {
        if (tasks.Count == 0)
        {
            return [];
        }

        var workers = Math.Max(1, Math.Min(maxWorkers, tasks.Count));
        if (workers == 1 || tasks.Count == 1)
        {
            var sequential = new List<T>(tasks.Count);
            foreach (var task in tasks)
            {
                cancellationToken.ThrowIfCancellationRequested();
                sequential.Add(await task());
            }

            return sequential;
        }

        using var gate = new SemaphoreSlim(workers, workers);
        var results = new T[tasks.Count];
        var inFlight = tasks.Select(async (factory, index) =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                results[index] = await factory();
            }
            finally
            {
                gate.Release();
            }
        });

        await Task.WhenAll(inFlight);
        return results;
    }
}
