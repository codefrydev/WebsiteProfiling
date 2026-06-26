using AiService.Application;
using AiService.Tools.Services.Citations;

namespace AiService.Tests;

public sealed class CitationCheckServiceTests
{
    [Fact]
    public async Task ResolveApiKey_prefers_provided_key()
    {
        var pipeline = new FakePipelineConfigRepository(new Dictionary<string, string>(StringComparer.Ordinal));
        var service = new CitationCheckService(pipeline, new FakeHttpClientFactory());
        var key = await service.ResolveApiKeyAsync("openai", "sk-test");
        Assert.Equal("sk-test", key);
    }

    [Fact]
    public async Task CheckAsync_unknown_provider_throws()
    {
        var pipeline = new FakePipelineConfigRepository(new Dictionary<string, string>(StringComparer.Ordinal));
        var service = new CitationCheckService(pipeline, new FakeHttpClientFactory());
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CheckAsync(new CitationCheckRequest("q", "Brand", "example.com", "unknown", "key")));
    }

    private sealed class FakePipelineConfigRepository(IReadOnlyDictionary<string, string> data)
        : AiService.Domain.Repositories.IPipelineConfigRepository
    {
        public Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(data);

        public Task<(IReadOnlyDictionary<string, string> Known, IReadOnlyList<AiService.Domain.Repositories.PipelineConfigUnknownEntry> Unknown)> LoadFullAsync(
            CancellationToken cancellationToken = default)
            => Task.FromResult<(IReadOnlyDictionary<string, string>, IReadOnlyList<AiService.Domain.Repositories.PipelineConfigUnknownEntry>)>(
                (data, []));

        public Task SaveAsync(
            IReadOnlyDictionary<string, string> known,
            IReadOnlyList<AiService.Domain.Repositories.PipelineConfigUnknownEntry> unknown,
            CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }

    private sealed class FakeHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
