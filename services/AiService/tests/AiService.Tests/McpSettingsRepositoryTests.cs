using AiService.Application.Mcp;
using AiService.Application.Persistence;
using AiService.Application.Repositories;
using AiService.Domain.Entities;
using AiService.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace AiService.Tests;

public sealed class McpSettingsRepositoryTests
{
    [Fact]
    public async Task MergeAsync_clears_bearer_token_cache_when_token_updated()
    {
        var options = new DbContextOptionsBuilder<AiDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AiDbContext(options);
        db.McpSettings.Add(new McpSettingsEntry { Id = 1, BearerToken = "old-token" });
        await db.SaveChangesAsync();

        var cache = new MemoryCache(new MemoryCacheOptions());
        cache.Set(McpAuthCacheKeys.BearerToken, "old-token");

        var repo = new McpSettingsRepository(db, cache);
        await repo.MergeAsync(new McpSettingsPatch { BearerToken = "new-token" });

        Assert.False(cache.TryGetValue(McpAuthCacheKeys.BearerToken, out _));
    }
}
