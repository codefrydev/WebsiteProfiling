using System.Text.Json.Nodes;
using AiService.Api.Application.Services;
using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;

namespace AiService.Tests;

public sealed class SecretsServiceTests
{
    [Fact]
    public async Task PutStateAsync_RoutesPipelineSecretToIntegrationRepository()
    {
        var llm = new FakeLlmSettingsRepository();
        var integration = new FakeIntegrationSecretsRepository();
        var mcp = new FakeMcpSettingsRepository();
        var features = new FakeFeatureFlagsRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, integration, mcp, features, google);

        var incoming = new JsonObject { ["bing_webmaster_api_key"] = "bing-key" };
        await service.PutStateAsync(incoming);

        Assert.Equal("bing-key", integration.LastPatch!.BingWebmasterApiKey);
        Assert.Empty(llm.ApiKeyUpdates);
        Assert.False(google.Merged);
    }

    [Fact]
    public async Task PutStateAsync_RoutesLlmApiKeyToLlmRepository()
    {
        var llm = new FakeLlmSettingsRepository();
        var integration = new FakeIntegrationSecretsRepository();
        var mcp = new FakeMcpSettingsRepository();
        var features = new FakeFeatureFlagsRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, integration, mcp, features, google);

        var incoming = new JsonObject { ["llm_api_key_openai"] = "sk-test" };
        await service.PutStateAsync(incoming);

        Assert.Equal("sk-test", llm.ApiKeyUpdates["openai"]);
    }

    [Fact]
    public async Task PutStateAsync_RoutesGoogleClientIdToGoogleRepository()
    {
        var llm = new FakeLlmSettingsRepository();
        var integration = new FakeIntegrationSecretsRepository();
        var mcp = new FakeMcpSettingsRepository();
        var features = new FakeFeatureFlagsRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, integration, mcp, features, google);

        var incoming = new JsonObject { ["google_client_id"] = "client.apps.googleusercontent.com" };
        await service.PutStateAsync(incoming);

        Assert.True(google.Merged);
        Assert.Equal("client.apps.googleusercontent.com", google.LastPatch!.ClientId);
    }

    [Fact]
    public async Task PutStateAsync_SkipsMaskedSentinel()
    {
        var llm = new FakeLlmSettingsRepository();
        var integration = new FakeIntegrationSecretsRepository();
        var mcp = new FakeMcpSettingsRepository();
        var features = new FakeFeatureFlagsRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, integration, mcp, features, google);

        var incoming = new JsonObject
        {
            ["llm_api_key_openai"] = "*",
            ["bing_webmaster_api_key"] = "••••",
        };
        await service.PutStateAsync(incoming);

        Assert.Empty(llm.ApiKeyUpdates);
        Assert.Null(integration.LastPatch);
    }

    [Fact]
    public async Task PutStateAsync_SkipsBlankSecretWrites()
    {
        var llm = new FakeLlmSettingsRepository();
        var integration = new FakeIntegrationSecretsRepository();
        var mcp = new FakeMcpSettingsRepository();
        var features = new FakeFeatureFlagsRepository();
        var google = new FakeGoogleAppSettingsRepository();
        var service = new SecretsService(llm, integration, mcp, features, google);

        var incoming = new JsonObject
        {
            ["llm_api_key_groq"] = "",
            ["bing_webmaster_api_key"] = "   ",
            ["google_client_id"] = "client.apps.googleusercontent.com",
        };
        await service.PutStateAsync(incoming);

        Assert.Empty(llm.ApiKeyUpdates);
        Assert.Null(integration.LastPatch);
        Assert.True(google.Merged);
        Assert.Equal("client.apps.googleusercontent.com", google.LastPatch!.ClientId);
    }

    private sealed class FakeLlmSettingsRepository : ILlmSettingsRepository
    {
        public Dictionary<string, string> ApiKeyUpdates { get; } = new(StringComparer.Ordinal);

        public Task<LlmSettings> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new LlmSettings { Provider = "openai" });

        public Task<LlmSettings> LoadForClientAsync(CancellationToken cancellationToken = default)
            => LoadAsync(cancellationToken);

        public Task MergeAsync(LlmSettingsPatch patch, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MergeProviderApiKeyAsync(
            string provider,
            string? apiKey,
            CancellationToken cancellationToken = default)
        {
            ApiKeyUpdates[provider] = apiKey ?? "";
            return Task.CompletedTask;
        }
    }

    private sealed class FakeIntegrationSecretsRepository : IIntegrationSecretsRepository
    {
        public IntegrationSecretsPatch? LastPatch { get; private set; }

        public Task<IntegrationSecrets> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new IntegrationSecrets());

        public Task MergeAsync(IntegrationSecretsPatch patch, CancellationToken cancellationToken = default)
        {
            LastPatch = patch;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeMcpSettingsRepository : IMcpSettingsRepository
    {
        public Task<McpSettings> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new McpSettings());

        public Task MergeAsync(McpSettingsPatch patch, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }

    private sealed class FakeFeatureFlagsRepository : IFeatureFlagsRepository
    {
        public Task<FeatureFlags> LoadAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new FeatureFlags());

        public Task MergeAsync(FeatureFlagsPatch patch, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
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
