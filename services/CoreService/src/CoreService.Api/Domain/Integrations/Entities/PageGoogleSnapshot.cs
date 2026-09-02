namespace CoreService.Api.Domain.Integrations.Entities;

/// <summary>Per-URL live Google fetch history in <c>page_google_snapshots</c>.</summary>
public sealed class PageGoogleSnapshot
{
    public long Id { get; set; }

    public string PageUrl { get; set; } = "";

    public string UrlNorm { get; set; } = "";

    public DateTimeOffset FetchedAt { get; set; }

    public string Data { get; set; } = "{}";
}
