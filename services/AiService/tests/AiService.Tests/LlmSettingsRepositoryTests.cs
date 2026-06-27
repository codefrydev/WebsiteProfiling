using AiService.Application.Repositories;

namespace AiService.Tests;

public sealed class LlmSettingsRepositoryTests
{
    [Fact]
    public void IsMaskedSentinel_PreservesExistingSecretOnPut()
    {
        Assert.True(LlmSettingsSecretMask.IsMaskedSentinel("*"));
        Assert.True(LlmSettingsSecretMask.IsMaskedSentinel("••••"));
        Assert.True(LlmSettingsSecretMask.IsMaskedSentinel("**"));
        Assert.False(LlmSettingsSecretMask.IsMaskedSentinel("sk-live"));
        Assert.False(LlmSettingsSecretMask.IsMaskedSentinel(""));
    }
}
