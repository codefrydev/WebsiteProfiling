using ReportService.Application.Build;

namespace ReportService.Tests;

public sealed class CtrCurveTests
{
    [Fact]
    public void IndustryCtrPercent_is_continuous_near_position_four()
    {
        var atThreeFive = CtrCurve.IndustryCtrPercent(3.5);
        var atFour = CtrCurve.IndustryCtrPercent(4.0);

        Assert.True(Math.Abs(atThreeFive - atFour) < 5.0);
    }

    [Fact]
    public void IndustryCtrFraction_interpolates_between_slots()
    {
        Assert.Equal(0.103, CtrCurve.IndustryCtrFraction(3.0), 3);
        Assert.Equal(0.100, CtrCurve.IndustryCtrFraction(3.1), 3);
        Assert.Equal(0.076, CtrCurve.IndustryCtrFraction(3.9), 3);
    }

    [Fact]
    public void IndustryCtrFraction_matches_position_slot()
    {
        Assert.Equal(0.278, CtrCurve.IndustryCtrFraction(1.0), 3);
        Assert.Equal(0.008, CtrCurve.IndustryCtrFraction(15.0), 3);
    }
}
