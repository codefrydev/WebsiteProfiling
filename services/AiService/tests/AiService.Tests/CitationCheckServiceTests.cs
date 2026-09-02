using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;
using AiService.Api.Tools.Services.Citations;
using CitationCheckService = AiService.Api.Tools.Services.Citations.CitationCheckService;

namespace AiService.Tests;

public sealed class CitationCheckServiceTests
{
    [Fact]
    public async Task ResolveApiKey_prefers_provided_key()
    {
        var llm = new FakeLlmSettingsRepository();
        var service = new CitationCheckService(llm, new FakeHttpClientFactory());
        var key = await service.ResolveApiKeyAsync("openai", "sk-test");
        Assert.Equal("sk-test", key);
    }

    [Fact]
    public async Task CheckAsync_unknown_provider_throws()
    {
        var llm = new FakeLlmSettingsRepository();
        var service = new CitationCheckService(llm, new FakeHttpClientFactory());
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CheckAsync(new CitationCheckRequest("q", "Brand", "example.com", "unknown", "key")));
    }

    private sealed class FakeLlmSettingsRepository : ILlmSettingsRepository
    {
        public Task<LlmSettings> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new LlmSettings());

        public Task<LlmSettings> LoadForClientAsync(CancellationToken cancellationToken = default)
            => LoadAsync(cancellationToken);

        public Task MergeAsync(LlmSettingsPatch patch, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MergeProviderApiKeyAsync(
            string provider,
            string? apiKey,
            CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }

    private sealed class FakeHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
