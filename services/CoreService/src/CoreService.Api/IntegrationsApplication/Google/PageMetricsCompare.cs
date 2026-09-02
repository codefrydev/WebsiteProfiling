namespace CoreService.Api.IntegrationsApplication.Google;

/// <summary>
/// Parity with web/src/lib/pageMetricsCompare.ts — page-level GSC/GA4 compare rows.
/// </summary>
public static class PageMetricsCompare
{
    public static IReadOnlyList<PageCompareMetricRow> Build(
        PageMetricsPayload current,
        PageMetricsPayload baseline)
    {
        var rows = new List<PageCompareMetricRow>();
        if (current.Gsc is not null || baseline.Gsc is not null)
        {
            rows.Add(DeltaRow("gsc_clicks", "Clicks", current.Gsc?.Clicks, baseline.Gsc?.Clicks, higherIsBetter: true));
            rows.Add(DeltaRow("gsc_impr", "Impressions", current.Gsc?.Impressions, baseline.Gsc?.Impressions, higherIsBetter: true));
            rows.Add(DeltaRow("gsc_ctr", "CTR %", current.Gsc?.Ctr, baseline.Gsc?.Ctr, higherIsBetter: true, format: "percent"));
            rows.Add(DeltaRow("gsc_pos", "Avg position", current.Gsc?.Position, baseline.Gsc?.Position, higherIsBetter: false));
        }

        if (current.Ga4 is not null || baseline.Ga4 is not null)
        {
            rows.Add(DeltaRow("ga4_sessions", "Sessions", current.Ga4?.Sessions, baseline.Ga4?.Sessions, higherIsBetter: true));
            rows.Add(DeltaRow("ga4_users", "Users", current.Ga4?.ActiveUsers, baseline.Ga4?.ActiveUsers, higherIsBetter: true));
            rows.Add(DeltaRow("ga4_views", "Page views", current.Ga4?.ScreenPageViews, baseline.Ga4?.ScreenPageViews, higherIsBetter: true));
            rows.Add(DeltaRow("ga4_engagement", "Engagement rate", current.Ga4?.EngagementRate, baseline.Ga4?.EngagementRate, higherIsBetter: true, format: "percent"));
            rows.Add(DeltaRow("ga4_duration", "Avg session (s)", current.Ga4?.AvgSessionDuration, baseline.Ga4?.AvgSessionDuration, higherIsBetter: true));
        }

        return rows.Where(r => r.Current is not null || r.Baseline is not null).ToList();
    }

    private static PageCompareMetricRow DeltaRow(
        string id,
        string label,
        double? current,
        double? baseline,
        bool higherIsBetter,
        string format = "count")
    {
        double? delta = current is not null && baseline is not null
            ? Math.Round(current.Value - baseline.Value, 1)
            : null;
        double? deltaPct = null;
        if (current is not null && baseline is not null && baseline.Value != 0)
        {
            deltaPct = Math.Round((current.Value - baseline.Value) / Math.Abs(baseline.Value) * 1000) / 10;
        }

        return new PageCompareMetricRow
        {
            Id = id,
            Label = label,
            Current = current,
            Baseline = baseline,
            Delta = delta,
            HigherIsBetter = higherIsBetter,
            Format = format,
            DeltaPct = deltaPct,
        };
    }
}

public sealed class PageMetricsPayload
{
    public PageGscMetrics? Gsc { get; init; }

    public PageGa4Metrics? Ga4 { get; init; }
}

public sealed class PageGscMetrics
{
    public double? Clicks { get; init; }

    public double? Impressions { get; init; }

    public double? Ctr { get; init; }

    public double? Position { get; init; }
}

public sealed class PageGa4Metrics
{
    public double? Sessions { get; init; }

    public double? ActiveUsers { get; init; }

    public double? ScreenPageViews { get; init; }

    public double? EngagementRate { get; init; }

    public double? AvgSessionDuration { get; init; }
}

public sealed class PageCompareMetricRow
{
    public string Id { get; init; } = "";

    public string Label { get; init; } = "";

    public double? Current { get; init; }

    public double? Baseline { get; init; }

    public double? Delta { get; init; }

    public bool HigherIsBetter { get; init; }

    public string Format { get; init; } = "count";

    public double? DeltaPct { get; init; }
}

public sealed class PageCompareArm
{
    public string Type { get; init; } = "snapshot";

    public long Id { get; init; }

    public string? FetchedAt { get; init; }

    public object? Gsc { get; init; }

    public object? Ga4 { get; init; }

    public PageMetricsPayload ToMetricsPayload() =>
        new()
        {
            Gsc = PageCompareMetricsParser.FromGscObject(Gsc),
            Ga4 = PageCompareMetricsParser.FromGa4Object(Ga4),
        };
}

public static class PageCompareMetricsParser
{
    public static PageGscMetrics? FromGscObject(object? gsc) =>
        gsc is Dictionary<string, object?> dict
            ? new PageGscMetrics
            {
                Clicks = ReadDouble(dict, "clicks"),
                Impressions = ReadDouble(dict, "impressions"),
                Ctr = ReadDouble(dict, "ctr"),
                Position = ReadDouble(dict, "position"),
            }
            : null;

    public static PageGa4Metrics? FromGa4Object(object? ga4) =>
        ga4 is Dictionary<string, object?> dict
            ? new PageGa4Metrics
            {
                Sessions = ReadDouble(dict, "sessions"),
                ActiveUsers = ReadDouble(dict, "activeUsers") ?? ReadDouble(dict, "active_users"),
                ScreenPageViews = ReadDouble(dict, "screenPageViews") ?? ReadDouble(dict, "screen_page_views"),
                EngagementRate = ReadDouble(dict, "engagementRate") ?? ReadDouble(dict, "engagement_rate"),
                AvgSessionDuration = ReadDouble(dict, "avgSessionDuration") ?? ReadDouble(dict, "avg_session_duration"),
            }
            : null;

    private static double? ReadDouble(Dictionary<string, object?> dict, string key)
    {
        if (!dict.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        return raw switch
        {
            double d => d,
            float f => f,
            int i => i,
            long l => l,
            decimal m => (double)m,
            string s when double.TryParse(s, out var parsed) => parsed,
            _ => null,
        };
    }
}
