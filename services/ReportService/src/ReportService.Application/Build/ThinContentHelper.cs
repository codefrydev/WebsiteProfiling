using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Shared thin-content detection (200 words; char fallback when word_count absent).</summary>
public static class ThinContentHelper
{
    public static bool IsThin(CrawlRow row)
    {
        if (row.WordCount is > 0)
        {
            return row.WordCount < CategoryHelpers.ThinContentWords;
        }

        var chars = row.ContentLength ?? 0;
        return chars > 0 && chars / 5 < CategoryHelpers.ThinContentWords;
    }

    public static string ThinContentMessage(CrawlRow row)
    {
        if (row.WordCount is > 0)
        {
            return $"Thin content ({row.WordCount} words)";
        }

        return $"Thin content (~{(row.ContentLength ?? 0) / 5} words, from {row.ContentLength} chars)";
    }
}
