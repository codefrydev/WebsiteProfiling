namespace ReportService.Application.Build;

/// <summary>AWR 2024 desktop organic CTR curve (ported from keyword_enrich.py).</summary>
public static class CtrCurve
{
    private static readonly Dictionary<int, double> Curve = new()
    {
        [1] = 0.278,
        [2] = 0.153,
        [3] = 0.103,
        [4] = 0.073,
        [5] = 0.053,
        [6] = 0.040,
        [7] = 0.031,
        [8] = 0.025,
        [9] = 0.021,
        [10] = 0.018,
    };

    private const double DefaultFraction = 0.008;

    public static double IndustryCtrFraction(double position)
    {
        var slot = position > 0 ? Math.Max(1, (int)Math.Ceiling(position)) : 1;
        return Curve.GetValueOrDefault(slot, DefaultFraction);
    }

    public static double IndustryCtrPercent(double position) =>
        IndustryCtrFraction(position) * 100.0;
}
