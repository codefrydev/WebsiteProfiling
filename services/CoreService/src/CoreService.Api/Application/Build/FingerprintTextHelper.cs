using System.Text.Json;
using System.Text.RegularExpressions;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python analysis/text.py normalize_fingerprint_text and top_keywords_as_text.</summary>
public static partial class FingerprintTextHelper
{
    private const int MaxFingerprintLength = 12000;

    public static string NormalizeFingerprintText(CrawlRow row)
    {
        var parts = new List<string>();
        AppendIfPresent(parts, row.Title);
        AppendIfPresent(parts, row.H1);
        AppendIfPresent(parts, row.MetaDescription);
        AppendIfPresent(parts, row.OgTitle);
        AppendIfPresent(parts, row.OgDescription);
        AppendIfPresent(parts, row.TwitterTitle);
        AppendIfPresent(parts, row.ContentExcerpt);

        var kwExtra = TopKeywordsAsText(row.TopKeywords);
        if (!string.IsNullOrWhiteSpace(kwExtra))
        {
            parts.Add(kwExtra);
        }

        var text = string.Join(' ', parts).ToLowerInvariant();
        text = WhitespaceCollapse().Replace(text, " ").Trim();
        return text.Length <= MaxFingerprintLength ? text : text[..MaxFingerprintLength];
    }

    public static string TopKeywordsAsText(string? raw, int maxTerms = 15)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Trim() == "[]")
        {
            return "";
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return "";
            }

            var words = new List<string>();
            foreach (var item in doc.RootElement.EnumerateArray().Take(maxTerms))
            {
                if (item.ValueKind != JsonValueKind.Object
                    || !item.TryGetProperty("word", out var wordEl)
                    || wordEl.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                var word = wordEl.GetString()?.Trim();
                if (string.IsNullOrWhiteSpace(word) || TextHygieneHelper.IsJunkSemanticTerm(word))
                {
                    continue;
                }

                words.Add(word);
            }

            return string.Join(' ', words);
        }
        catch (JsonException)
        {
            return "";
        }
    }

    private static void AppendIfPresent(List<string> parts, string? value)
    {
        var s = value?.Trim();
        if (!string.IsNullOrWhiteSpace(s))
        {
            parts.Add(s);
        }
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceCollapse();
}
