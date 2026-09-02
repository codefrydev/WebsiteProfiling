namespace AiService.Api.Application.Services;

/// <summary>Tiered Ollama reachability — local probe failure is not always fatal.</summary>
public static class OllamaConnectionHealth
{
    public const string Healthy = "healthy";
    public const string Degraded = "degraded";
    public const string Offline = "offline";

    public static string Resolve(bool localOk, bool cloudCatalogOk)
    {
        if (!localOk && !cloudCatalogOk)
        {
            return Offline;
        }

        if (!localOk && cloudCatalogOk)
        {
            return Degraded;
        }

        return Healthy;
    }

    public static bool CatalogUsable(bool localOk, bool cloudCatalogOk) => localOk || cloudCatalogOk;

    public static string? Warning(bool localOk, bool cloudCatalogOk, string baseUrl)
    {
        if (!localOk && cloudCatalogOk)
        {
            return $"Local Ollama daemon is not reachable at {baseUrl}; cloud catalog is available.";
        }

        if (localOk && !cloudCatalogOk)
        {
            return "Cloud model catalog is unavailable; showing installed local models only.";
        }

        return null;
    }

    public static string OfflineError(bool localOk, bool cloudCatalogOk)
    {
        if (!localOk && !cloudCatalogOk)
        {
            return "Cannot reach Ollama or the cloud model catalog.";
        }

        return "Cannot reach Ollama. Is it running?";
    }
}
