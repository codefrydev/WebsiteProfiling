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
        if (position <= 0)
        {
            return Curve.GetValueOrDefault(1, DefaultFraction);
        }

        var lower = Math.Max(1, (int)Math.Floor(position));
        var upper = Math.Max(1, (int)Math.Ceiling(position));
        if (lower == upper || Math.Abs(position - lower) < 1e-9)
        {
            return Curve.GetValueOrDefault(lower, DefaultFraction);
        }

        var lowerCtr = Curve.GetValueOrDefault(lower, DefaultFraction);
        var upperCtr = Curve.GetValueOrDefault(upper, DefaultFraction);
        var weight = position - lower;
        return lowerCtr + (upperCtr - lowerCtr) * weight;
    }

    public static double IndustryCtrPercent(double position) =>
        IndustryCtrFraction(position) * 100.0;
}
