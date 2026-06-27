using System.Text.Json;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/content_analytics.py core analytics helpers.</summary>
public static class ContentAnalyticsBuilder
{
    public static Dictionary<string, object?> BuildContentAnalytics(IReadOnlyList<CrawlRow> rows)
    {
        var result = new Dictionary<string, object?>
        {
            ["word_count_stats"] = new Dictionary<string, object?>
            {
                ["mean"] = 0, ["median"] = 0, ["p25"] = 0, ["p75"] = 0, ["min"] = 0, ["max"] = 0,
            },
            ["word_count_distribution"] = new Dictionary<string, int>(),
            ["reading_level_distribution"] = new Dictionary<string, int>(),
            ["content_ratio_distribution"] = new Dictionary<string, int>(),
            ["top_keywords_site"] = new List<Dictionary<string, object?>>(),
            ["thin_pages"] = new List<Dictionary<string, object?>>(),
        };

        if (!rows.Any(r => r.WordCount.HasValue))
        {
            return result;
        }

        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return result;
        }

        var wordCounts = success.Select(r => r.WordCount ?? 0).OrderBy(x => x).ToList();
        result["word_count_stats"] = new Dictionary<string, object?>
        {
            ["mean"] = Math.Round(wordCounts.Average(), 1),
            ["median"] = Math.Round(Percentile(wordCounts, 0.5), 1),
            ["p25"] = Math.Round(Percentile(wordCounts, 0.25), 1),
            ["p75"] = Math.Round(Percentile(wordCounts, 0.75), 1),
            ["min"] = wordCounts.Min(),
            ["max"] = wordCounts.Max(),
        };

        var wcBins = new (int Lo, int Hi, string Label)[]
        {
            (0, 100, "0-100"),
            (101, 300, "101-300"),
            (301, 600, "301-600"),
            (601, 1000, "601-1000"),
            (1001, 2000, "1001-2000"),
            (2001, 999999, "2001+"),
        };
        result["word_count_distribution"] = wcBins.ToDictionary(
            b => b.Label,
            b => wordCounts.Count(w => w >= b.Lo && w <= b.Hi));

        if (success.Any(r => r.ReadingLevel.HasValue))
        {
            var levels = success.Select(r => r.ReadingLevel ?? 0).ToList();
            var rlBins = new (double Lo, double Hi, string Label)[]
            {
                (0, 6, "Elementary (0-5)"),
                (6, 9, "Middle School (6-8)"),
                (9, 13, "High School (9-12)"),
                (13, double.PositiveInfinity, "College (13+)"),
            };
            result["reading_level_distribution"] = rlBins.ToDictionary(
                b => b.Label,
                b => levels.Count(r => r >= b.Lo && r < b.Hi));
        }

        if (success.Any(r => r.ContentHtmlRatio.HasValue))
        {
            var ratios = success.Select(r => r.ContentHtmlRatio ?? 0).ToList();
            var crBins = new (double Lo, double Hi, string Label)[]
            {
                (0, 10, "<10%"),
                (10.01, 20, "10-20%"),
                (20.01, 40, "20-40%"),
                (40.01, 100, ">40%"),
            };
            result["content_ratio_distribution"] = crBins.ToDictionary(
                b => b.Label,
                b => ratios.Count(r => r >= b.Lo && r <= b.Hi));
        }

        if (success.Any(r => !string.IsNullOrWhiteSpace(r.TopKeywords)))
        {
            var counter = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var row in success)
            {
                foreach (var item in ParseTopKeywordsItems(row.TopKeywords))
                {
                    if (!item.TryGetValue("word", out var wordObj) || wordObj is not string word
                        || string.IsNullOrWhiteSpace(word)
                        || TextHygieneHelper.IsJunkSemanticTerm(word))
                    {
                        continue;
                    }

                    var count = item.TryGetValue("count", out var countObj) ? Convert.ToInt32(countObj) : 0;
                    counter[word] = counter.GetValueOrDefault(word) + count;
                }
            }

            result["top_keywords_site"] = counter
                .OrderByDescending(kv => kv.Value)
                .Take(30)
                .Select(kv => new Dictionary<string, object?> { ["word"] = kv.Key, ["count"] = kv.Value })
                .ToList();
        }

        var thinPages = new List<Dictionary<string, object?>>();
        foreach (var row in success)
        {
            if (string.IsNullOrWhiteSpace(row.Url))
            {
                continue;
            }

            var w = row.WordCount ?? 0;
            if (w is > 0 and < 300)
            {
                thinPages.Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["word_count"] = w,
                });
            }
        }

        result["thin_pages"] = thinPages;
        return result;
    }

    public static Dictionary<string, object?> BuildResponseTimeStats(IReadOnlyList<CrawlRow> rows)
    {
        var result = new Dictionary<string, object?>
        {
            ["p25"] = 0, ["p50"] = 0, ["p75"] = 0, ["p95"] = 0, ["p99"] = 0,
            ["slow_pages"] = new List<Dictionary<string, object?>>(),
            ["distribution"] = new Dictionary<string, int>(),
        };

        if (!rows.Any(r => r.ResponseTimeMs.HasValue))
        {
            return result;
        }

        var values = rows.Where(r => r.ResponseTimeMs.HasValue).Select(r => (double)r.ResponseTimeMs!.Value).OrderBy(x => x).ToList();
        if (values.Count == 0)
        {
            return result;
        }

        result["p25"] = Math.Round(Percentile(values, 0.25), 0);
        result["p50"] = Math.Round(Percentile(values, 0.5), 0);
        result["p75"] = Math.Round(Percentile(values, 0.75), 0);
        result["p95"] = Math.Round(Percentile(values, 0.95), 0);
        result["p99"] = Math.Round(Percentile(values, 0.99), 0);

        var rtBins = new (int Lo, int Hi, string Label)[]
        {
            (0, 200, "<200ms"),
            (200, 500, "200-500ms"),
            (500, 1000, "500ms-1s"),
            (1000, 2000, "1-2s"),
            (2000, 999999, ">2s"),
        };
        result["distribution"] = rtBins.ToDictionary(
            b => b.Label,
            b => rows.Count(r => (r.ResponseTimeMs ?? 0) >= b.Lo && (r.ResponseTimeMs ?? 0) < b.Hi));

        var slowPages = rows
            .Where(r => r.ResponseTimeMs is > 2000 && !string.IsNullOrWhiteSpace(r.Url))
            .Select(r => new Dictionary<string, object?>
            {
                ["url"] = r.Url.Trim(),
                ["response_time_ms"] = r.ResponseTimeMs!.Value,
            })
            .OrderByDescending(r => Convert.ToInt32(r["response_time_ms"]))
            .Take(50)
            .ToList();
        result["slow_pages"] = slowPages;
        return result;
    }

    public static Dictionary<string, object?> BuildDepthDistribution(IReadOnlyList<CrawlRow> rows)
    {
        var result = new Dictionary<string, object?>
        {
            ["by_depth"] = new Dictionary<string, int>(),
            ["max_depth"] = 0,
            ["avg_depth"] = 0,
        };

        if (!rows.Any(r => r.Depth.HasValue))
        {
            return result;
        }

        var depths = rows.Where(r => r.Depth.HasValue).Select(r => r.Depth!.Value).ToList();
        if (depths.Count == 0)
        {
            return result;
        }

        result["max_depth"] = depths.Max();
        result["avg_depth"] = Math.Round(depths.Average(), 1);
        result["by_depth"] = depths
            .GroupBy(d => d)
            .OrderBy(g => g.Key)
            .ToDictionary(g => g.Key.ToString(), g => g.Count());
        return result;
    }

    public static List<Dictionary<string, object?>> ParseTopKeywordsItems(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var items = new List<Dictionary<string, object?>>();
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (el.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var word = el.TryGetProperty("word", out var w) ? w.GetString()?.Trim() : null;
                if (string.IsNullOrWhiteSpace(word))
                {
                    continue;
                }

                var count = el.TryGetProperty("count", out var c) && c.TryGetInt32(out var ci) ? ci : 1;
                items.Add(new Dictionary<string, object?> { ["word"] = word, ["count"] = count });
            }

            return items;
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static double Percentile(IReadOnlyList<int> sorted, double p) =>
        Percentile(sorted.Select(x => (double)x).ToList(), p);

    private static double Percentile(IReadOnlyList<double> sorted, double p)
    {
        if (sorted.Count == 0)
        {
            return 0;
        }

        if (sorted.Count == 1)
        {
            return sorted[0];
        }

        var rank = p * (sorted.Count - 1);
        var lo = (int)Math.Floor(rank);
        var hi = (int)Math.Ceiling(rank);
        if (lo == hi)
        {
            return sorted[lo];
        }

        var weight = rank - lo;
        return sorted[lo] + (sorted[hi] - sorted[lo]) * weight;
    }

    public static Dictionary<string, object?> BuildTextContentAnalysis(IReadOnlyList<CrawlRow> rows)
    {
        var empty = new Dictionary<string, object?>
        {
            ["vocabulary_stats"] = new Dictionary<string, object?>
            {
                ["unique_terms"] = 0,
                ["pages_with_keywords"] = 0,
                ["avg_terms_per_page"] = 0.0,
                ["total_term_occurrences"] = 0,
            },
            ["keyword_index"] = new List<Dictionary<string, object?>>(),
            ["keyword_frequency_histogram"] = new Dictionary<string, int>
            {
                ["1"] = 0, ["2-5"] = 0, ["6-20"] = 0, ["21+"] = 0,
            },
        };

        if (!rows.Any(r => !string.IsNullOrWhiteSpace(r.TopKeywords)))
        {
            return empty;
        }

        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return empty;
        }

        var index = new Dictionary<string, (int TotalCount, Dictionary<string, int> Pages)>(StringComparer.Ordinal);
        var pagesWithKeywords = 0;
        var totalOccurrences = 0;

        foreach (var row in success)
        {
            if (string.IsNullOrWhiteSpace(row.Url))
            {
                continue;
            }

            var url = row.Url.Trim();
            var items = ParseTopKeywordsItems(row.TopKeywords);
            var pageHad = false;
            foreach (var item in items)
            {
                var word = item["word"]?.ToString()?.ToLowerInvariant() ?? "";
                if (string.IsNullOrWhiteSpace(word) || TextHygieneHelper.IsJunkSemanticTerm(word))
                {
                    continue;
                }

                var count = Math.Max(1, Convert.ToInt32(item.GetValueOrDefault("count") ?? 1));
                if (!index.TryGetValue(word, out var entry))
                {
                    entry = (0, new Dictionary<string, int>(StringComparer.Ordinal));
                }

                entry.TotalCount += count;
                entry.Pages[url] = entry.Pages.GetValueOrDefault(url) + count;
                index[word] = entry;
                totalOccurrences += count;
                pageHad = true;
            }

            if (pageHad)
            {
                pagesWithKeywords++;
            }
        }

        var histogram = new Dictionary<string, int> { ["1"] = 0, ["2-5"] = 0, ["6-20"] = 0, ["21+"] = 0 };
        foreach (var (_, data) in index)
        {
            var pc = data.Pages.Count;
            if (pc == 1)
            {
                histogram["1"]++;
            }
            else if (pc <= 5)
            {
                histogram["2-5"]++;
            }
            else if (pc <= 20)
            {
                histogram["6-20"]++;
            }
            else
            {
                histogram["21+"]++;
            }
        }

        var keywordIndex = index
            .OrderByDescending(kv => kv.Value.TotalCount)
            .Select(kv =>
            {
                var topPages = kv.Value.Pages
                    .OrderByDescending(p => p.Value)
                    .Take(5)
                    .Select(p => new Dictionary<string, object?> { ["url"] = p.Key, ["count"] = p.Value })
                    .ToList();
                return new Dictionary<string, object?>
                {
                    ["word"] = kv.Key,
                    ["total_count"] = kv.Value.TotalCount,
                    ["page_count"] = kv.Value.Pages.Count,
                    ["top_pages"] = topPages,
                };
            })
            .ToList();

        return new Dictionary<string, object?>
        {
            ["vocabulary_stats"] = new Dictionary<string, object?>
            {
                ["unique_terms"] = index.Count,
                ["pages_with_keywords"] = pagesWithKeywords,
                ["avg_terms_per_page"] = pagesWithKeywords > 0
                    ? Math.Round(totalOccurrences / (double)pagesWithKeywords, 1)
                    : 0.0,
                ["total_term_occurrences"] = totalOccurrences,
            },
            ["keyword_index"] = keywordIndex,
            ["keyword_frequency_histogram"] = histogram,
        };
    }

    public static Dictionary<string, object?> BuildSocialCoverage(IReadOnlyList<CrawlRow> rows)
    {
        var result = new Dictionary<string, object?>
        {
            ["og_coverage_pct"] = 0,
            ["twitter_coverage_pct"] = 0,
            ["og_image_coverage_pct"] = 0,
            ["missing_og"] = new List<string>(),
            ["missing_twitter"] = new List<string>(),
            ["og_image_missing"] = new List<string>(),
        };

        var success = CategoryHelpers.SuccessRows(rows);
        var htmlRows = success.Where(r =>
            string.IsNullOrWhiteSpace(r.ContentType)
            || r.ContentType.Contains("text/html", StringComparison.OrdinalIgnoreCase)).ToList();
        if (htmlRows.Count == 0)
        {
            return result;
        }

        var total = htmlRows.Count;
        if (htmlRows.Any(r => r.OgTitle is not null))
        {
            var hasOg = htmlRows.Count(r => !string.IsNullOrWhiteSpace(r.OgTitle));
            result["og_coverage_pct"] = Math.Round(100.0 * hasOg / total, 1);
            result["missing_og"] = htmlRows
                .Where(r => string.IsNullOrWhiteSpace(r.OgTitle) && !string.IsNullOrWhiteSpace(r.Url))
                .Select(r => r.Url.Trim())
                .Take(100)
                .ToList();
        }

        if (htmlRows.Any(r => r.TwitterCard is not null))
        {
            var hasTw = htmlRows.Count(r => !string.IsNullOrWhiteSpace(r.TwitterCard));
            result["twitter_coverage_pct"] = Math.Round(100.0 * hasTw / total, 1);
            result["missing_twitter"] = htmlRows
                .Where(r => string.IsNullOrWhiteSpace(r.TwitterCard) && !string.IsNullOrWhiteSpace(r.Url))
                .Select(r => r.Url.Trim())
                .Take(100)
                .ToList();
        }

        if (htmlRows.Any(r => r.OgImage is not null))
        {
            var hasImg = htmlRows.Count(r => !string.IsNullOrWhiteSpace(r.OgImage));
            result["og_image_coverage_pct"] = Math.Round(100.0 * hasImg / total, 1);
            result["og_image_missing"] = htmlRows
                .Where(r => string.IsNullOrWhiteSpace(r.OgImage) && !string.IsNullOrWhiteSpace(r.Url))
                .Select(r => r.Url.Trim())
                .Take(100)
                .ToList();
        }

        return result;
    }

    public static Dictionary<string, object?> BuildTechStackSummary(IReadOnlyList<CrawlRow> rows)
    {
        var result = new Dictionary<string, object?>
        {
            ["technologies"] = new List<Dictionary<string, object?>>(),
            ["total_pages_analyzed"] = 0,
        };

        if (!rows.Any(r => !string.IsNullOrWhiteSpace(r.TechStack)))
        {
            return result;
        }

        var success = CategoryHelpers.SuccessRows(rows);
        var htmlRows = success.Where(r =>
            string.IsNullOrWhiteSpace(r.ContentType)
            || r.ContentType.Contains("text/html", StringComparison.OrdinalIgnoreCase)).ToList();
        if (htmlRows.Count == 0)
        {
            return result;
        }

        result["total_pages_analyzed"] = htmlRows.Count;
        var techUrls = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var row in htmlRows)
        {
            var url = row.Url.Trim();
            foreach (var tech in ParseTechStack(row.TechStack))
            {
                techUrls.TryAdd(tech, []);
                techUrls[tech].Add(url);
            }
        }

        result["technologies"] = techUrls
            .Select(kv => new Dictionary<string, object?>
            {
                ["name"] = kv.Key,
                ["count"] = kv.Value.Count,
                ["sample_urls"] = kv.Value.Take(3).ToList(),
            })
            .OrderByDescending(t => Convert.ToInt32(t["count"]))
            .ToList();
        return result;
    }

    private static IEnumerable<string> ParseTechStack(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return doc.RootElement.EnumerateArray()
                .Where(el => el.ValueKind == JsonValueKind.String)
                .Select(el => el.GetString())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s!)
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
