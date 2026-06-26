using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

public sealed record ReportChartData(
    Dictionary<string, int> StatusCounts,
    List<string> MimeLabels,
    List<int> MimeValues,
    List<string> OutlinkLabels,
    List<int> OutlinkCounts,
    List<string> TitleLabels,
    List<int> TitleCounts,
    List<string> DomainLabels,
    List<int> DomainValues);

/// <summary>Chart histogram slices from Python reporting/builder.py.</summary>
public static class ReportChartDataBuilder
{
    private static readonly int[] OutlinkBins = [0, 1, 2, 3, 6, 11, 21, 51, 999999];
    private static readonly string[] OutlinkLabelsStatic = ["0", "1", "2", "3-5", "6-10", "11-20", "21-50", "51+"];
    private static readonly int[] TitleBins = [0, 1, 21, 51, 101, 201, 9999];
    private static readonly string[] TitleLabelsStatic = ["0", "1-20", "21-50", "51-100", "101-200", "200+"];

    public static ReportChartData Build(IReadOnlyList<CrawlRow> rows)
    {
        var statusCounts = rows
            .GroupBy(r => (r.Status ?? "unknown").Trim())
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);

        var mimeCounts = rows
            .Select(r => NormalizeMime(r.ContentType))
            .GroupBy(m => m)
            .OrderByDescending(g => g.Count())
            .Take(20)
            .ToList();

        var outlinks = rows.Select(r => r.Outlinks ?? 0).ToList();
        var outlinkCounts = BinCount(outlinks, OutlinkBins);

        var titleLengths = rows.Select(r => (r.Title ?? "").Length).ToList();
        var titleCounts = BinCount(titleLengths, TitleBins);

        var domainCounts = rows
            .Select(r => ExtractHost(r.Url))
            .Where(h => !string.IsNullOrEmpty(h))
            .GroupBy(h => h)
            .OrderByDescending(g => g.Count())
            .Take(20)
            .ToList();

        return new ReportChartData(
            statusCounts,
            mimeCounts.Select(g => g.Key).ToList(),
            mimeCounts.Select(g => g.Count()).ToList(),
            OutlinkLabelsStatic.ToList(),
            outlinkCounts,
            TitleLabelsStatic.ToList(),
            titleCounts,
            domainCounts.Select(g => g.Key).ToList(),
            domainCounts.Select(g => g.Count()).ToList());
    }

    private static List<int> BinCount(IReadOnlyList<int> values, int[] bins)
    {
        var counts = new List<int>();
        for (var i = 0; i < bins.Length - 1; i++)
        {
            counts.Add(values.Count(v => v >= bins[i] && v < bins[i + 1]));
        }

        return counts;
    }

    private static string NormalizeMime(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return "unknown";
        }

        var semi = contentType.IndexOf(';');
        return (semi >= 0 ? contentType[..semi] : contentType).Trim();
    }

    private static string ExtractHost(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return "";
        }

        return Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) ? uri.Host : "";
    }
}
