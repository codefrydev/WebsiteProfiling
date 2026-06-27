namespace ReportService.Application.Build;

/// <summary>Minimal port of Python analysis/text_hygiene.is_junk_semantic_term for keyword filtering.</summary>
public static class TextHygieneHelper
{
    private static readonly HashSet<string> JunkTokens = new(StringComparer.Ordinal)
    {
        "h1", "h2", "h3", "h4", "h5", "h6",
        "html", "body", "head", "div", "span", "class", "href",
        "http", "https", "www", "com", "org", "net", "null", "undefined", "nan",
    };

    public static bool IsJunkSemanticTerm(string? term)
    {
        var tokens = Tokenize(term);
        if (tokens.Count == 0)
        {
            return true;
        }

        if (tokens.All(t => JunkTokens.Contains(t)))
        {
            return true;
        }

        return tokens.Any(t => JunkTokens.Contains(t));
    }

    private static List<string> Tokenize(string? term) =>
        System.Text.RegularExpressions.Regex.Matches(term ?? "", @"\b[\w']+\b")
            .Select(m => m.Value.ToLowerInvariant())
            .Where(t => t.Length > 0)
            .ToList();
}
