using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>
/// Port of Python reporting/seo_summary.py — crawl summary, SEO health, issues, recommendations.
/// </summary>
public static partial class SeoSummaryBuilder
{
    public const int TitleLenMin = 30;
    public const int TitleLenMax = 60;
    public const int MetaDescLenMin = 70;
    public const int MetaDescLenMax = 160;

    public sealed record SeoSummaryResult(
        Dictionary<string, object?> Summary,
        Dictionary<string, int> SeoHealth,
        Dictionary<string, List<Dictionary<string, string>>> Issues,
        List<string> Recommendations);

    public static SeoSummaryResult Compute(IReadOnlyList<CrawlRow> rows)
    {
        var total = rows.Count;
        var count2Xx = 0;
        var count3Xx = 0;
        var count4Xx = 0;
        var count5Xx = 0;
        var countError = 0;
        var outlinkSum2Xx = 0;
        var titleLenSum2Xx = 0;
        var successCount = 0;
        var crawlTimes = rows.Select(r => r.CrawlTimeS).Where(t => t.HasValue).Select(t => t!.Value).ToList();
        double? crawlTimeS = crawlTimes.Count >= 2
            ? crawlTimes.Max() - crawlTimes.Min()
            : crawlTimes.FirstOrDefault();

        var issues = new Dictionary<string, List<Dictionary<string, string>>>
        {
            ["broken"] = [],
            ["redirects"] = [],
            ["seo"] = [],
        };

        var seoHealth = new Dictionary<string, int>
        {
            ["missing_title"] = 0,
            ["title_short"] = 0,
            ["title_long"] = 0,
            ["title_ok"] = 0,
            ["missing_meta_desc"] = 0,
            ["meta_desc_short"] = 0,
            ["meta_desc_long"] = 0,
            ["meta_desc_ok"] = 0,
            ["h1_zero"] = 0,
            ["h1_one"] = 0,
            ["h1_multi"] = 0,
            ["thin_content"] = 0,
        };

        foreach (var row in rows)
        {
            var st = NormalizeStatus(row.Status);
            if (Status2Xx().IsMatch(st))
            {
                count2Xx++;
                successCount++;
                outlinkSum2Xx += row.Outlinks ?? 0;

                var title = (row.Title ?? "").Trim();
                var titleLen = title.Length;
                titleLenSum2Xx += titleLen;

                if (titleLen == 0)
                {
                    seoHealth["missing_title"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "missing_title",
                        ["url"] = row.Url,
                        ["message"] = "Missing title",
                    });
                }
                else if (titleLen < TitleLenMin)
                {
                    seoHealth["title_short"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "title_short",
                        ["url"] = row.Url,
                        ["message"] = $"Title too short ({titleLen} chars)",
                    });
                }
                else if (titleLen > TitleLenMax)
                {
                    seoHealth["title_long"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "title_long",
                        ["url"] = row.Url,
                        ["message"] = $"Title too long ({titleLen} chars)",
                    });
                }
                else
                {
                    seoHealth["title_ok"]++;
                }

                var mdLen = row.MetaDescriptionLen ?? 0;
                if (mdLen == 0)
                {
                    seoHealth["missing_meta_desc"]++;
                }
                else if (mdLen < MetaDescLenMin)
                {
                    seoHealth["meta_desc_short"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "meta_desc_short",
                        ["url"] = row.Url,
                        ["message"] = $"Meta description too short ({mdLen} chars)",
                    });
                }
                else if (mdLen > MetaDescLenMax)
                {
                    seoHealth["meta_desc_long"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "meta_desc_long",
                        ["url"] = row.Url,
                        ["message"] = $"Meta description too long ({mdLen} chars)",
                    });
                }
                else
                {
                    seoHealth["meta_desc_ok"]++;
                }

                var h1c = row.H1Count ?? -1;
                if (h1c == 0)
                {
                    seoHealth["h1_zero"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "h1_missing",
                        ["url"] = row.Url,
                        ["message"] = "Missing H1",
                    });
                }
                else if (h1c == 1)
                {
                    seoHealth["h1_one"]++;
                }
                else if (h1c > 1)
                {
                    seoHealth["h1_multi"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "h1_multi",
                        ["url"] = row.Url,
                        ["message"] = $"Multiple H1s ({h1c})",
                    });
                }

                if (ThinContentHelper.IsThin(row))
                {
                    seoHealth["thin_content"]++;
                    issues["seo"].Add(new Dictionary<string, string>
                    {
                        ["type"] = "thin_content",
                        ["url"] = row.Url,
                        ["message"] = ThinContentHelper.ThinContentMessage(row),
                    });
                }
            }
            else if (Status3Xx().IsMatch(st))
            {
                count3Xx++;
                issues["redirects"].Add(new Dictionary<string, string>
                {
                    ["url"] = row.Url,
                    ["status"] = st,
                    ["final_url"] = row.FinalUrl ?? "",
                });
            }
            else if (Status4Xx().IsMatch(st) || Status5Xx().IsMatch(st) || st is "error" or "blocked_by_robots")
            {
                if (Status4Xx().IsMatch(st))
                {
                    count4Xx++;
                }
                else if (Status5Xx().IsMatch(st))
                {
                    count5Xx++;
                }
                else
                {
                    countError++;
                }

                issues["broken"].Add(new Dictionary<string, string> { ["url"] = row.Url, ["status"] = st });
            }
        }

        var summary = new Dictionary<string, object?>
        {
            ["total_urls"] = total,
            ["count_2xx"] = count2Xx,
            ["count_3xx"] = count3Xx,
            ["count_4xx"] = count4Xx,
            ["count_5xx"] = count5Xx,
            ["count_error"] = countError,
            ["success_rate"] = total > 0 ? Math.Round(100.0 * count2Xx / total, 1) : 0,
            ["avg_outlinks"] = successCount > 0 ? Math.Round((double)outlinkSum2Xx / successCount, 1) : 0,
            ["avg_title_len"] = successCount > 0 ? Math.Round((double)titleLenSum2Xx / successCount, 1) : 0,
            ["crawl_time_s"] = crawlTimeS is not null ? Math.Round(crawlTimeS.Value, 1) : null,
        };

        var recommendations = BuildRecommendations(issues, seoHealth);
        return new SeoSummaryResult(summary, seoHealth, issues, recommendations);
    }

    private static List<string> BuildRecommendations(
        Dictionary<string, List<Dictionary<string, string>>> issues,
        Dictionary<string, int> seoHealth)
    {
        var recs = new List<string>();
        if (issues["broken"].Count > 0)
        {
            recs.Add($"Fix {issues["broken"].Count} broken or error URL(s).");
        }

        if (issues["redirects"].Count > 0)
        {
            recs.Add($"Review {issues["redirects"].Count} redirect(s); consolidate if possible.");
        }

        if (seoHealth["missing_title"] > 0)
        {
            recs.Add($"Add titles to {seoHealth["missing_title"]} page(s).");
        }

        if (seoHealth["title_short"] + seoHealth["title_long"] > 0)
        {
            recs.Add($"Optimize title length on {seoHealth["title_short"] + seoHealth["title_long"]} page(s) (aim 30–60 chars).");
        }

        if (seoHealth["missing_meta_desc"] > 0)
        {
            recs.Add($"Add meta descriptions to {seoHealth["missing_meta_desc"]} page(s).");
        }

        if (seoHealth["meta_desc_short"] + seoHealth["meta_desc_long"] > 0)
        {
            recs.Add($"Optimize meta description length on {seoHealth["meta_desc_short"] + seoHealth["meta_desc_long"]} page(s) (aim 70–160 chars).");
        }

        if (seoHealth["h1_zero"] > 0)
        {
            recs.Add($"Add one H1 per page on {seoHealth["h1_zero"]} page(s).");
        }

        if (seoHealth["h1_multi"] > 0)
        {
            recs.Add($"Use a single H1 per page on {seoHealth["h1_multi"]} page(s).");
        }

        if (seoHealth["thin_content"] > 0)
        {
            recs.Add($"Expand thin content on {seoHealth["thin_content"]} page(s) (under {CategoryHelpers.ThinContentWords} words).");
        }

        return recs;
    }

    private static string NormalizeStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        if (double.TryParse(value, out var f) && !double.IsNaN(f))
        {
            return ((int)f).ToString();
        }

        return value.Trim();
    }

    [GeneratedRegex(@"^2\d{2}$")]
    private static partial Regex Status2Xx();

    [GeneratedRegex(@"^3\d{2}$")]
    private static partial Regex Status3Xx();

    [GeneratedRegex(@"^4\d{2}$")]
    private static partial Regex Status4Xx();

    [GeneratedRegex(@"^5\d{2}$")]
    private static partial Regex Status5Xx();
}
