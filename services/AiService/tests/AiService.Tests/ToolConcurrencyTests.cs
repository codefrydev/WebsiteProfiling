using System.Text.Json.Nodes;
using AiService.Application.Chat;

namespace AiService.Tests;

public sealed class ToolConcurrencyTests
{
    [Fact]
    public async Task MapParallelAsync_preserves_order_with_bounded_workers()
    {
        var started = 0;
        var maxInFlight = 0;
        var gate = new object();

        var factories = Enumerable.Range(0, 8)
            .Select<int, Func<Task<int>>>(i => async () =>
            {
                var current = Interlocked.Increment(ref started);
                lock (gate)
                {
                    maxInFlight = Math.Max(maxInFlight, current);
                }

                await Task.Delay(20);
                Interlocked.Decrement(ref started);
                return i;
            })
            .ToList();

        var results = await ToolConcurrency.MapParallelAsync(factories, maxWorkers: 2);
        Assert.Equal(Enumerable.Range(0, 8), results);
        Assert.True(maxInFlight <= 2);
    }
}
