using System.Text.Json;
using WebsiteProfiling.Contracts.Integrations;
using WebsiteProfiling.Contracts.Json;

namespace CoreService.Api.IntegrationsApplication.Google;

public static class PageLookupMapper
{
    public static PageMetricsRow? ToGscMetrics(JsonElement page)
    {
        if (page.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return new PageMetricsRow
        {
            Url = JsonCoercion.GetString(page, "page") ?? "",
            Clicks = JsonCoercion.GetInt(page, "clicks") ?? 0,
            Impressions = JsonCoercion.GetInt(page, "impressions") ?? 0,
            Ctr = JsonCoercion.GetDouble(page, "ctr") ?? 0,
            Position = JsonCoercion.GetDouble(page, "position") ?? 0,
        };
    }

    public static PageMetricsRow? ToGa4Metrics(JsonElement page)
    {
        if (page.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return new PageMetricsRow
        {
            Path = JsonCoercion.GetString(page, "path") ?? "",
            Url = JsonCoercion.GetString(page, "full_url") ?? JsonCoercion.GetString(page, "path") ?? "",
            Sessions = JsonCoercion.GetInt(page, "sessions") ?? 0,
            ActiveUsers = JsonCoercion.GetInt(page, "activeUsers") ?? JsonCoercion.GetInt(page, "active_users") ?? 0,
            ScreenPageViews = JsonCoercion.GetInt(page, "screenPageViews") ?? JsonCoercion.GetInt(page, "screen_page_views") ?? 0,
        };
    }

    public static PageLookupResult ToPageLookupResult(string url, JsonElement? gscPage, JsonElement? ga4Page, string? note = null)
        => new()
        {
            Url = url,
            Found = gscPage is not null || ga4Page is not null,
            Gsc = gscPage is { ValueKind: JsonValueKind.Object } gsc ? ToGscMetrics(gsc) : null,
            Ga4 = ga4Page is { ValueKind: JsonValueKind.Object } ga4 ? ToGa4Metrics(ga4) : null,
            Note = note,
        };
}
