using System.Text.RegularExpressions;

namespace AiService.Api.Tools.Handlers.Geo;

/// <summary>Ports Python <c>content_analysis/reading_level.py</c>.</summary>
public static partial class ReadingLevel
{
    public static int CountSyllables(string word)
    {
        var w = word.ToLowerInvariant().Trim();
        if (w.Length <= 3)
        {
            return 1;
        }

        const string vowels = "aeiouy";
        var count = 0;
        var prevVowel = false;
        foreach (var ch in w)
        {
            var isVowel = vowels.Contains(ch);
            if (isVowel && !prevVowel)
            {
                count++;
            }

            prevVowel = isVowel;
        }

        if (w.EndsWith('e') && count > 1)
        {
            count--;
        }

        return Math.Max(1, count);
    }

    public static List<string> SplitSentences(string? bodyText)
        => SentenceSplitRegex().Split(bodyText ?? "")
            .Select(s => s.Trim())
            .Where(s => s.Length > 5)
            .ToList();

    public static double FleschKincaidGrade(IReadOnlyList<string> words, string bodyText)
    {
        var wordCount = words.Count;
        if (wordCount <= 30)
        {
            return 0.0;
        }

        var sentenceCount = Math.Max(1, SplitSentences(bodyText).Count);
        var totalSyllables = words.Sum(CountSyllables);
        var readingLevel = (0.39 * ((double)wordCount / sentenceCount))
            + (11.8 * ((double)totalSyllables / Math.Max(1, wordCount)))
            - 15.59;
        return Math.Max(0.0, Math.Min(18.0, Math.Round(readingLevel, 1)));
    }

    [GeneratedRegex(@"[.!?]+")]
    private static partial Regex SentenceSplitRegex();
}
