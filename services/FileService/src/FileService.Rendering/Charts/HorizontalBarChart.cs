using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace FileService.Rendering.Charts;

public static class HorizontalBarChart
{
    public static void Compose(IContainer container, int value, int max = 100, string? barColor = null)
    {
        var pct = max <= 0 ? 0 : Math.Clamp(value / (double)max, 0, 1);
        var color = barColor ?? PdfTheme.AccentColor;
        container.Height(8).Background(PdfTheme.MutedBg).Row(row =>
        {
            if (pct > 0)
            {
                row.RelativeItem((float)pct).Background(color);
            }
            if (pct < 1)
            {
                row.RelativeItem((float)(1 - pct));
            }
        });
    }
}
