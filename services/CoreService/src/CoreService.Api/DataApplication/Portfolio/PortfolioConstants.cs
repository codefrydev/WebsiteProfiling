namespace CoreService.Api.DataApplication.Portfolio;

public static class PortfolioConstants
{
    public const int MaxCrawlRuns = 120;
    public static readonly TimeSpan GroupsCacheTtl = TimeSpan.FromSeconds(45);

    public const string UnknownBrand = "Unknown property";
    public const string EmDash = "—";

    public static readonly IReadOnlyList<string> CategoryOrder =
    [
        "technical_seo",
        "performance",
        "core_web_vitals",
        "link_health",
        "security",
        "html_accessibility",
        "mobile",
        "intelligence",
    ];

    public static readonly HashSet<string> DataSourceIds = new(StringComparer.Ordinal)
    {
        "crawl", "lighthouse", "search_console", "analytics", "backlinks",
    };

    public static readonly HashSet<string> ValidWidgets = new(StringComparer.OrdinalIgnoreCase)
    {
        "full", "groups", "summary", "card",
    };
}
