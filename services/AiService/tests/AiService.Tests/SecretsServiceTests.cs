using System.Text.Json.Nodes;
using AiService.Application.Services;
using AiService.Domain.Entities;
using AiService.Domain.Repositories;

namespace AiService.Tests;

public sealed class SecretsServiceTests
{
    [Fact]
    public async Task PutStateAsync_RoutesPipelineSecretToPipelineRepository()
    {
        var llm = new FakeLlmConfigRepository();
        var pipeline = new FakePipelineConfigRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, pipeline, google);

        var incoming = new JsonObject { ["bing_webmaster_api_key"] = "bing-key" };
        await service.PutStateAsync(incoming);

        Assert.Equal("bing-key", pipeline.Known["bing_webmaster_api_key"]);
        Assert.Null(llm.SavedEntries);
        Assert.False(google.Merged);
    }

    [Fact]
    public async Task PutStateAsync_RoutesLlmApiKeyToLlmRepository()
    {
        var llm = new FakeLlmConfigRepository();
        var pipeline = new FakePipelineConfigRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, pipeline, google);

        var incoming = new JsonObject { ["llm_api_key_openai"] = "sk-test" };
        await service.PutStateAsync(incoming);

        Assert.NotNull(llm.SavedEntries);
        Assert.Equal("sk-test", llm.SavedEntries!["llm_api_key_openai"]);
        Assert.Empty(pipeline.Known);
    }

    [Fact]
    public async Task PutStateAsync_RoutesGoogleClientIdToGoogleRepository()
    {
        var llm = new FakeLlmConfigRepository();
        var pipeline = new FakePipelineConfigRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, pipeline, google);

        var incoming = new JsonObject { ["google_client_id"] = "client.apps.googleusercontent.com" };
        await service.PutStateAsync(incoming);

        Assert.True(google.Merged);
        Assert.Equal("client.apps.googleusercontent.com", google.LastPatch!.ClientId);
    }

    [Fact]
    public async Task PutStateAsync_SkipsMaskedSentinel()
    {
        var llm = new FakeLlmConfigRepository();
        var pipeline = new FakePipelineConfigRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, pipeline, google);

        var incoming = new JsonObject
        {
            ["llm_api_key_openai"] = "*",
            ["bing_webmaster_api_key"] = "••••",
        };
        await service.PutStateAsync(incoming);

        Assert.Null(llm.SavedEntries);
        Assert.Empty(pipeline.Known);
    }

    [Fact]
    public async Task PutStateAsync_SkipsBlankSecretWrites()
    {
        var llm = new FakeLlmConfigRepository();
        var pipeline = new FakePipelineConfigRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, pipeline, google);

        var incoming = new JsonObject
        {
            ["llm_api_key_groq"] = "",
            ["bing_webmaster_api_key"] = "   ",
            ["google_client_id"] = "client.apps.googleusercontent.com",
        };
        await service.PutStateAsync(incoming);

        Assert.Null(llm.SavedEntries);
        Assert.Empty(pipeline.Known);
        Assert.True(google.Merged);
        Assert.Equal("client.apps.googleusercontent.com", google.LastPatch!.ClientId);
    }

    private sealed class FakeLlmConfigRepository : ILlmConfigRepository
    {
        public IReadOnlyDictionary<string, string>? SavedEntries { get; private set; }

        public Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyDictionary<string, string>>(new Dictionary<string, string>());

        public Task<IReadOnlyList<LlmConfigEntry>> LoadFullAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<LlmConfigEntry>>(Array.Empty<LlmConfigEntry>());

        public Task SaveAsync(IReadOnlyDictionary<string, string> entries, CancellationToken cancellationToken = default)
        {
            SavedEntries = new Dictionary<string, string>(entries, StringComparer.Ordinal);
            return Task.CompletedTask;
        }
    }

    private sealed class FakePipelineConfigRepository : IPipelineConfigRepository
    {
        public Dictionary<string, string> Known { get; } = new(StringComparer.Ordinal);

        public Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyDictionary<string, string>>(Known);

        public Task<(IReadOnlyDictionary<string, string> Known, IReadOnlyList<PipelineConfigUnknownEntry> Unknown)> LoadFullAsync(
            CancellationToken cancellationToken = default)
            => Task.FromResult<(IReadOnlyDictionary<string, string>, IReadOnlyList<PipelineConfigUnknownEntry>)>(
                (new Dictionary<string, string>(Known, StringComparer.Ordinal), Array.Empty<PipelineConfigUnknownEntry>()));

        public Task SaveAsync(
            IReadOnlyDictionary<string, string> known,
            IReadOnlyList<PipelineConfigUnknownEntry> unknown,
            CancellationToken cancellationToken = default)
        {
            Known.Clear();
            foreach (var (key, value) in known)
            {
                Known[key] = value;
            }

            return Task.CompletedTask;
        }
    }

    private sealed class FakeGoogleAppSettingsRepository : IGoogleAppSettingsRepository
    {
        public bool Merged { get; private set; }

        public GoogleAppSettingsPatch? LastPatch { get; private set; }

        public Task<GoogleAppSettings> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new GoogleAppSettings());

        public Task MergeAsync(GoogleAppSettingsPatch patch, CancellationToken cancellationToken = default)
        {
            Merged = true;
            LastPatch = patch;
            return Task.CompletedTask;
        }
    }
}
