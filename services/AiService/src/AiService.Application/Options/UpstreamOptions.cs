namespace AiService.Application.Options;

/// <summary>Upstream FastAPI bridge for Python audit tools (<c>FASTAPI_URL</c>).</summary>
public sealed class UpstreamOptions
{
    public const string SectionName = "Upstream";

    public string FastApiUrl { get; set; } = "http://127.0.0.1:8000";
}
