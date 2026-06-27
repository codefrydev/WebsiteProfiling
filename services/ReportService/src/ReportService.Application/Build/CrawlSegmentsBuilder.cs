using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/crawl_segments.py per path-prefix health scores.</summary>
public static partial class CrawlSegmentsBuilder
{
    [GeneratedRegex(@"\.\*|\.\+|\\[dwWDSBbAZ]|\[|\(|\{|\$|\|")]
    private static partial Regex RegexIndicator();

    public static Dictionary<string, object?>? Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<ReportCategory> categories,
        IReadOnlyList<string> pathPrefixes)
    {
        if (pathPrefixes.Count == 0 || rows.Count == 0)
        {
            return null;
        }

        var overallScores = categories
            .Where(c => c.Score.HasValue)
            .Select(c => (double)c.Score!.Value)
            .ToList();
        int? overall = overallScores.Count > 0
            ? RoundHalfUp(overallScores.Average())
            : null;

        var compiledPatterns = new List<(string Prefix, bool IsRegex, object Compiled)>();
        foreach (var raw in pathPrefixes)
        {
            var prefix = raw.StartsWith('/') ? raw : $"/{raw}";
            var isRegex = IsRegexPattern(prefix);
            object compiled;
            try
            {
                compiled = isRegex ? new Regex(prefix) : prefix;
            }
            catch (ArgumentException)
            {
                isRegex = false;
                compiled = prefix;
            }

            compiledPatterns.Add((prefix, isRegex, compiled));
        }

        var segments = new List<Dictionary<string, object?>>();
        foreach (var (prefix, isRegex, compiled) in compiledPatterns)
        {
            var matchingRows = new List<CrawlRow>();
            foreach (var row in rows)
            {
                var url = row.Url ?? "";
                string path;
                try
                {
                    path = Uri.TryCreate(url, UriKind.Absolute, out var uri)
                        ? uri.AbsolutePath
                        : url;
                    if (string.IsNullOrEmpty(path))
                    {
                        path = "/";
                    }
                }
                catch (UriFormatException)
                {
                    path = url;
                }

                if (MatchesPath(path, prefix, isRegex, compiled))
                {
                    matchingRows.Add(row);
                }
            }

            var health = matchingRows.Count > 0 ? SegmentHealth(matchingRows) : 0;
            segments.Add(new Dictionary<string, object?>
            {
                ["prefix"] = prefix,
                ["url_count"] = matchingRows.Count,
                ["health_score"] = health,
                ["pattern_type"] = isRegex ? "regex" : "prefix",
            });
        }

        return new Dictionary<string, object?>
        {
            ["overall_health"] = overall,
            ["segments"] = segments,
        };
    }

    internal static bool IsRegexPattern(string pattern) => RegexIndicator().IsMatch(pattern);

    internal static bool MatchesPath(string path, string pattern, bool isRegex, object compiled)
    {
        if (isRegex && compiled is Regex rx)
        {
            return rx.IsMatch(path);
        }

        var prefix = pattern;
        return path == prefix || path.StartsWith(prefix.EndsWith('/') ? prefix : prefix + "/", StringComparison.Ordinal);
    }

    internal static int SegmentHealth(IReadOnlyList<CrawlRow> segmentRows)
    {
        var n = segmentRows.Count;
        if (n == 0)
        {
            return 0;
        }

        var score = 100;
        var ok = segmentRows.Count(r => CategoryHelpers.IsSuccessStatus(r.Status));
        var errorRate = 1.0 - (double)ok / n;
        if (errorRate > 0)
        {
            score -= RoundHalfUp(30 * errorRate);
        }

        var missingTitle = segmentRows.Count(r => string.IsNullOrWhiteSpace(r.Title));
        var missingTitleRate = (double)missingTitle / n;
        if (missingTitleRate > 0.1)
        {
            score -= RoundHalfUp(20 * missingTitleRate);
        }

        var missingMeta = segmentRows.Count(r => string.IsNullOrWhiteSpace(r.MetaDescription));
        var missingMetaRate = (double)missingMeta / n;
        if (missingMetaRate > 0.1)
        {
            score -= RoundHalfUp(10 * missingMetaRate);
        }

        var noViewport = segmentRows.Count(r => r.ViewportPresent != true);
        var noViewportRate = (double)noViewport / n;
        if (noViewportRate > 0.1)
        {
            score -= RoundHalfUp(10 * noViewportRate);
        }

        return Math.Max(0, score);
    }

    internal static int RoundHalfUp(double value) => (int)Math.Floor(value + 0.5);
}
