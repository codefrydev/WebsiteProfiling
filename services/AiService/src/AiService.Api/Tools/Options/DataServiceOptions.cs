namespace AiService.Api.Tools.Options;

/// <summary>
/// Data service upstream used by <see cref="Bridge.DataServiceClient"/> for report PDF/CSV/JSON
/// export deliverables. Env override: <c>DATA_SERVICE_URL</c>.
/// </summary>
public sealed class DataServiceOptions
{
    public const string SectionName = "DataService";

    /// <summary>Core/Data service base URL. Default matches local compose / BFF upstream.</summary>
    public string BaseUrl { get; set; } = "http://127.0.0.1:8094";
}
