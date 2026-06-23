using System.Text.RegularExpressions;
using FileService.Domain.Models;

namespace FileService.Application.Mapping;

public static partial class IssueNormalizer
{
    public static IssueModel Normalize(
        string category,
        string priority,
        string message,
        string url,
        string recommendation,
        int? gscClicks,
        int? gscImpressions,
        int? impactScore)
    {
        var headline = NormalizeHeadline(message, url);
        return new IssueModel
        {
            Category = category,
            Priority = priority,
            Message = message,
            Headline = headline,
            Url = url,
            UrlPath = ExtractPath(url),
            Recommendation = recommendation,
            GscClicks = gscClicks,
            GscImpressions = gscImpressions,
            ImpactScore = impactScore,
        };
    }

    public static string NormalizeHeadline(string message, string url)
    {
        var headline = message.Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            return Truncate(headline, 160);
        }
        try
        {
            var path = new Uri(url.StartsWith("http") ? url : $"https://{url}").AbsolutePath;
            if (headline.Contains(path, StringComparison.OrdinalIgnoreCase))
            {
                headline = headline.Replace(path, "", StringComparison.OrdinalIgnoreCase).Trim(' ', '-', ':');
            }
        }
        catch
        {
            // keep headline
        }
        return Truncate(headline, 160);
    }

    public static string ExtractPath(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return "";
        }
        try
        {
            return new Uri(url.StartsWith("http") ? url : $"https://{url}").AbsolutePath;
        }
        catch
        {
            return url;
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
