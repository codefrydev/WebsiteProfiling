using AiService.Application.Services;

namespace AiService.Tests;

public sealed class SecretsKeyCatalogTests
{
    [Theory]
    [InlineData("bing_webmaster_api_key", "pipeline")]
    [InlineData("mcp_token", "pipeline")]
    [InlineData("feature_chat_enabled", "pipeline")]
    [InlineData("llm_api_key_openai", "llm")]
    [InlineData("google_client_id", "google")]
    public void ResolveStorage_RoutesByCatalog(string key, string expected)
    {
        Assert.Equal(expected, SecretsKeyCatalog.ResolveStorage(key)?.ToString().ToLowerInvariant());
    }

    [Theory]
    [InlineData("*", true)]
    [InlineData("••••", true)]
    [InlineData("{configured}", true)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("sk-live-key", false)]
    public void IsMaskedSentinel_DetectsPlaceholders(string value, bool expected)
    {
        Assert.Equal(expected, ConfigSecretHelpers.IsMaskedSentinel(value));
    }

    [Theory]
    [InlineData("llm_api_key_groq", "", "gsk-old", true)]
    [InlineData("llm_api_key_groq", "*", "gsk-old", true)]
    [InlineData("llm_api_key_groq", "gsk-new", "gsk-old", false)]
    [InlineData("google_client_id", "", "client-id", false)]
    public void ShouldPreserveExistingSecret_BlocksBlankSecretOverwrite(
        string key,
        string incoming,
        string existing,
        bool expected)
    {
        Assert.Equal(expected, ConfigSecretHelpers.ShouldPreserveExistingSecret(key, incoming, existing));
    }
}
