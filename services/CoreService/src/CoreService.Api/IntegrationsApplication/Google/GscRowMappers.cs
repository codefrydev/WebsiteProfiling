using WebsiteProfiling.Contracts.Google;

namespace CoreService.Api.IntegrationsApplication.Google;

/// <summary>
/// GSC Search Analytics row mappers — parity with Python gsc._to_query_record / _to_page_record.
/// </summary>
public static class GscRowMappers
{
    public static GscQueryRecord ToQueryRecord(string query, int clicks, int impressions, double ctr, double position) =>
        new()
        {
            Query = query,
            Clicks = clicks,
            Impressions = impressions,
            Ctr = Math.Round(ctr * 100, 2),
            Position = Math.Round(position, 1),
        };

    public static GscPageRecord ToPageRecord(string page, int clicks, int impressions, double ctr, double position) =>
        new()
        {
            Page = page,
            Clicks = clicks,
            Impressions = impressions,
            Ctr = Math.Round(ctr * 100, 2),
            Position = Math.Round(position, 1),
        };
}
