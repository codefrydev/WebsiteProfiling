namespace AiService.Tools.Options;

/// <summary>
/// FastAPI upstream used by <see cref="Bridge.PythonToolBridgeClient"/> for tools not yet ported to C#.
/// Env override: <c>FASTAPI_URL</c>.
/// </summary>
public sealed class FastApiOptions
{
    public const string SectionName = "FastApi";

    /// <summary>FastAPI base URL. Default matches local compose / BFF upstream.</summary>
    public string BaseUrl { get; set; } = "http://127.0.0.1:8001";
}
