using System.Text.Json;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/builder_sections/content_urls.build_content_url_lists.</summary>
public static class ContentUrlListsBuilder
{
    public static Dictionary<string, List<Dictionary<string, object?>>> Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<CrawlRow> successRows)
    {
        var result = EmptyResult();
        if (rows.Count == 0)
        {
            return result;
        }

        if (rows.Any(r => r.H1Count.HasValue))
        {
            foreach (var row in rows)
            {
                if (string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                var url = row.Url.Trim();
                var title = (row.Title ?? "").Trim();
                var h1Count = row.H1Count ?? -1;
                if (h1Count is 0 or -1)
                {
                    result["missing_h1"].Add(new Dictionary<string, object?> { ["url"] = url, ["title"] = title });
                }
                else if (h1Count > 1)
                {
                    result["multiple_h1"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = url,
                        ["h1_count"] = h1Count,
                        ["title"] = title,
                    });
                }
            }
        }

        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Url))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.Title))
            {
                result["missing_title"].Add(new Dictionary<string, object?> { ["url"] = row.Url.Trim() });
            }
        }

        if (rows.Any(r => r.MetaDescriptionLen.HasValue || r.MetaDescription is not null))
        {
            foreach (var row in rows)
            {
                if (string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                var url = row.Url.Trim();
                var title = (row.Title ?? "").Trim();
                var ml = row.MetaDescriptionLen ?? (row.MetaDescription ?? "").Length;
                if (ml == 0)
                {
                    result["missing_meta_desc"].Add(new Dictionary<string, object?> { ["url"] = url, ["title"] = title });
                }
                else if (ml is > 0 and < SeoSummaryBuilder.MetaDescLenMin)
                {
                    result["meta_desc_short"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = url, ["title"] = title, ["meta_desc_len"] = ml,
                    });
                }
                else if (ml > SeoSummaryBuilder.MetaDescLenMax)
                {
                    result["meta_desc_long"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = url, ["title"] = title, ["meta_desc_len"] = ml,
                    });
                }
            }
        }

        if (rows.Any(r => r.ContentLength.HasValue))
        {
            foreach (var row in rows)
            {
                if (string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                var c = row.ContentLength ?? 0;
                if (c is > 0 and < SeoSummaryBuilder.ThinContentChars)
                {
                    result["thin_content"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = row.Url.Trim(),
                        ["title"] = (row.Title ?? "").Trim(),
                        ["content_length"] = c,
                    });
                }
            }
        }

        if (successRows.Any(r => r.CanonicalUrl is not null))
        {
            foreach (var row in successRows)
            {
                if (string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                var url = row.Url.Trim();
                var title = (row.Title ?? "").Trim();
                var canon = (row.CanonicalUrl ?? "").Trim();
                if (string.IsNullOrEmpty(canon))
                {
                    result["missing_canonical"].Add(new Dictionary<string, object?> { ["url"] = url, ["title"] = title });
                }
                else if (!string.Equals(url.TrimEnd('/'), canon.TrimEnd('/'), StringComparison.OrdinalIgnoreCase))
                {
                    result["canonical_mismatch"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = url, ["canonical_url"] = canon, ["title"] = title,
                    });
                }
            }
        }

        if (successRows.Any(r => r.ImagesWithoutAlt.HasValue))
        {
            foreach (var row in successRows)
            {
                var missing = row.ImagesWithoutAlt ?? 0;
                if (missing <= 0 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["missing_alt"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["images_without_alt"] = missing,
                    ["images_total"] = row.ImagesTotal ?? 0,
                });
            }
        }

        if (successRows.Any(r => r.ImgWithoutLazy.HasValue))
        {
            foreach (var row in successRows)
            {
                var missing = row.ImgWithoutLazy ?? 0;
                if (missing <= 0 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["missing_lazy"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["img_without_lazy"] = missing,
                    ["images_total"] = row.ImagesTotal ?? 0,
                });
            }
        }

        if (successRows.Any(r => r.ImgWithoutDimensions.HasValue))
        {
            foreach (var row in successRows)
            {
                var missing = row.ImgWithoutDimensions ?? 0;
                if (missing <= 0 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["missing_dimensions"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["img_without_dimensions"] = missing,
                    ["images_total"] = row.ImagesTotal ?? 0,
                });
            }
        }

        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Url))
            {
                continue;
            }

            var title = (row.Title ?? "").Trim();
            var n = title.Length;
            if (n == 0)
            {
                continue;
            }

            var url = row.Url.Trim();
            if (n < SeoSummaryBuilder.TitleLenMin)
            {
                result["title_short"].Add(new Dictionary<string, object?>
                {
                    ["url"] = url, ["title"] = title, ["title_length"] = n,
                });
            }
            else if (n > SeoSummaryBuilder.TitleLenMax)
            {
                result["title_long"].Add(new Dictionary<string, object?>
                {
                    ["url"] = url, ["title"] = title, ["title_length"] = n,
                });
            }
        }

        if (rows.Any(r => r.ResponseTimeMs.HasValue))
        {
            foreach (var row in rows)
            {
                var ms = row.ResponseTimeMs;
                if (ms is null or <= 2000 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["slow_response"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["response_time_ms"] = ms.Value,
                });
            }
        }

        if (successRows.Any(r => r.HtmlLang is not null))
        {
            foreach (var row in successRows)
            {
                if (string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(row.HtmlLang))
                {
                    result["missing_html_lang"].Add(new Dictionary<string, object?> { ["url"] = row.Url.Trim() });
                }
            }
        }

        if (successRows.Any(r => r.ViewportPresent.HasValue))
        {
            foreach (var row in successRows)
            {
                if (string.IsNullOrWhiteSpace(row.Url) || row.ViewportPresent == true)
                {
                    continue;
                }

                result["invalid_viewport"].Add(new Dictionary<string, object?> { ["url"] = row.Url.Trim() });
            }
        }

        if (successRows.Any(r => r.ReadingLevel.HasValue))
        {
            foreach (var row in successRows)
            {
                var val = row.ReadingLevel;
                if (val is null or <= 12 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["high_reading_level"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["reading_level"] = val.Value,
                });
            }
        }

        if (successRows.Any(r => r.WordCount.HasValue))
        {
            foreach (var row in successRows)
            {
                var w = row.WordCount ?? 0;
                if (w is <= 0 or >= 100 || string.IsNullOrWhiteSpace(row.Url))
                {
                    continue;
                }

                result["very_thin_content"].Add(new Dictionary<string, object?>
                {
                    ["url"] = row.Url.Trim(),
                    ["word_count"] = w,
                });
            }
        }

        return result;
    }

    private static Dictionary<string, List<Dictionary<string, object?>>> EmptyResult() =>
        new(StringComparer.Ordinal)
        {
            ["missing_h1"] = [],
            ["missing_title"] = [],
            ["multiple_h1"] = [],
            ["missing_meta_desc"] = [],
            ["meta_desc_short"] = [],
            ["meta_desc_long"] = [],
            ["thin_content"] = [],
            ["missing_canonical"] = [],
            ["canonical_mismatch"] = [],
            ["missing_alt"] = [],
            ["missing_lazy"] = [],
            ["missing_dimensions"] = [],
            ["title_short"] = [],
            ["title_long"] = [],
            ["slow_response"] = [],
            ["missing_html_lang"] = [],
            ["invalid_viewport"] = [],
            ["high_reading_level"] = [],
            ["very_thin_content"] = [],
        };
}
