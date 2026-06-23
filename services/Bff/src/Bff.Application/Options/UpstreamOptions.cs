namespace Bff.Application.Options;

/// <summary>
/// Base URLs + timeouts for the services the BFF fronts. Both upstreams are
/// network-internal; only the BFF is browser-facing.
/// </summary>
public sealed class UpstreamOptions
{
    public const string SectionName = "Upstream";

    /// <summary>FastAPI base URL (env override: FASTAPI_URL). Default matches the new internal compose service.</summary>
    public string FastApiBaseUrl { get; set; } = "http://127.0.0.1:8001";

    /// <summary>FileService base URL (env override: FILE_SERVICE_URL).</summary>
    public string FileServiceBaseUrl { get; set; } = "http://127.0.0.1:8080";

    /// <summary>Timeout for normal (non-streaming) upstream calls. Parity with the TS proxy (120s).</summary>
    public int TimeoutSeconds { get; set; } = 120;
}
