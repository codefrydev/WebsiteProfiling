namespace Bff.Application.Options;

/// <summary>
/// Base URLs + timeouts for the services the BFF fronts. Both upstreams are
/// network-internal; only the BFF is browser-facing.
/// </summary>
public sealed class UpstreamOptions
{
    public const string SectionName = "Upstream";

    /// <summary>FastAPI base URL (env override: FASTAPI_URL). Default matches the new internal compose service.</summary>
    public string FastApiBaseUrl { get; set; } = "http://127.0.0.1:8096";

    /// <summary>Timeout for normal (non-streaming) upstream calls. Parity with the TS proxy (120s).</summary>
    public int TimeoutSeconds { get; set; } = 120;

    /// <summary>Data service base URL (env override: DATA_SERVICE_URL). Internal .NET read service.</summary>
    public string DataBaseUrl { get; set; } = "http://127.0.0.1:8091";

    /// <summary>Integrations service base URL (env override: INTEGRATIONS_SERVICE_URL).</summary>
    public string IntegrationsBaseUrl { get; set; } = "http://127.0.0.1:8093";

    /// <summary>AiService base URL (env override: AI_SERVICE_URL). Internal .NET AI/LLM service.</summary>
    public string AiBaseUrl { get; set; } = "http://127.0.0.1:8092";

    /// <summary>
    /// Comma-separated /api path prefixes routed to the Ai service instead of FastAPI
    /// (env override: AI_ROUTES). Empty = AI routes stay on FastAPI (rollback-safe default).
    /// </summary>
    public string[] AiRoutes { get; set; } = [];

    /// <summary>
    /// Comma-separated /api path prefixes routed to the Data service instead of FastAPI
    /// (env override: DATA_ROUTES). Supports GET/HEAD reads and POST/PUT/DELETE mutations on matched
    /// prefixes. Empty = everything stays on FastAPI (rollback-safe default).
    /// </summary>
    public string[] DataRoutes { get; set; } = [];

    /// <summary>
    /// Comma-separated /api path prefixes routed to the Integrations service
    /// (env override: INTEGRATIONS_ROUTES). Property-scoped <c>/api/properties/*/google</c> paths are
    /// always matched when any Integrations route is configured.
    /// </summary>
    public string[] IntegrationsRoutes { get; set; } = [];

    /// <summary>Report service base URL (env override: REPORT_SERVICE_URL). Internal report build + compare/dashboard proxies.</summary>
    public string ReportBaseUrl { get; set; } = "http://127.0.0.1:8094";

    /// <summary>
    /// Comma-separated /api path prefixes routed to the Report service instead of FastAPI
    /// (env override: REPORT_ROUTES).
    /// </summary>
    public string[] ReportRoutes { get; set; } = [];
}
