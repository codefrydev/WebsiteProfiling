using AiService.Application.Services;

namespace AiService.Tests;

public sealed class OllamaConnectionHealthTests
{
    [Theory]
    [InlineData(true, true, OllamaConnectionHealth.Healthy)]
    [InlineData(true, false, OllamaConnectionHealth.Healthy)]
    [InlineData(false, true, OllamaConnectionHealth.Degraded)]
    [InlineData(false, false, OllamaConnectionHealth.Offline)]
    public void Resolve_maps_probe_results(bool localOk, bool cloudCatalogOk, string expected)
    {
        Assert.Equal(expected, OllamaConnectionHealth.Resolve(localOk, cloudCatalogOk));
    }

    [Fact]
    public void Warning_is_null_when_fully_healthy()
    {
        Assert.Null(OllamaConnectionHealth.Warning(true, true, "http://127.0.0.1:11434"));
    }

    [Fact]
    public void Warning_describes_local_probe_failure_when_cloud_ok()
    {
        var warning = OllamaConnectionHealth.Warning(false, true, "http://127.0.0.1:11434");
        Assert.Contains("not reachable", warning, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("cloud catalog", warning, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Warning_describes_cloud_failure_when_local_ok()
    {
        var warning = OllamaConnectionHealth.Warning(true, false, "http://127.0.0.1:11434");
        Assert.Contains("Cloud model catalog is unavailable", warning, StringComparison.Ordinal);
    }
}
