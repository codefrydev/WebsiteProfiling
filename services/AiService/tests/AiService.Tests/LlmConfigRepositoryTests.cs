using AiService.Application.Persistence;
using AiService.Application.Repositories;
using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests;

public sealed class LlmConfigRepositoryTests
{
    private static LlmConfigRepository CreateRepo(out AiDbContext db)
    {
        var options = new DbContextOptionsBuilder<AiDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        db = new AiDbContext(options);
        return new LlmConfigRepository(db);
    }

    [Fact]
    public async Task SaveAsync_PartialUpdate_PreservesOtherKeys()
    {
        var repo = CreateRepo(out var db);
        await repo.SaveAsync(new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["llm_enabled"] = "true",
            ["llm_api_key_openai"] = "sk-secret",
            ["llm_provider"] = "openai",
        });

        await repo.SaveAsync(new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["llm_enabled"] = "false",
        });

        var loaded = await repo.LoadAsync();
        Assert.Equal("false", loaded["llm_enabled"]);
        Assert.Equal("sk-secret", loaded["llm_api_key_openai"]);
        Assert.Equal("openai", loaded["llm_provider"]);
        await db.DisposeAsync();
    }

    [Fact]
    public async Task SaveAsync_MaskedSentinel_PreservesExistingSecret()
    {
        var repo = CreateRepo(out var db);
        await repo.SaveAsync(new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["llm_api_key_openai"] = "sk-original",
        });

        await repo.SaveAsync(new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["llm_api_key_openai"] = "*",
            ["llm_enabled"] = "true",
        });

        var loaded = await repo.LoadAsync();
        Assert.Equal("sk-original", loaded["llm_api_key_openai"]);
        Assert.Equal("true", loaded["llm_enabled"]);
        await db.DisposeAsync();
    }
}
