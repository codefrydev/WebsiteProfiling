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

    private static readonly HashSet<string> HeadingTokens = new(StringComparer.Ordinal)
    {
        "h1", "h2", "h3", "h4", "h5", "h6",
    };

    public static bool IsJunkSemanticTerm(string? term)
    {
        var tokens = Tokenize(term);
        if (tokens.Count == 0)
        {
            return true;
        }

        if (tokens.All(t => HeadingTokens.Contains(t)))
        {
            return true;
        }

        if (tokens.All(t => JunkTokens.Contains(t)))
        {
            return true;
        }

        return false;
    }

    public static List<string> FilterSemanticTerms(IEnumerable<string> terms) =>
        terms.Where(t => !string.IsNullOrWhiteSpace(t) && !IsJunkSemanticTerm(t)).ToList();

    public static List<Dictionary<string, object?>> FilterTopicClusters(
        IReadOnlyList<Dictionary<string, object?>> clusters)
    {
        var output = new List<Dictionary<string, object?>>();
        foreach (var cluster in clusters)
        {
            var top = (cluster.GetValueOrDefault("top_keyword")?.ToString()
                ?? cluster.GetValueOrDefault("representative")?.ToString() ?? "").Trim();
            if (string.IsNullOrEmpty(top) || IsJunkSemanticTerm(top))
            {
                continue;
            }

            var copy = new Dictionary<string, object?>(cluster);
            if (copy.TryGetValue("keywords", out var keywordsObj) && keywordsObj is IEnumerable<object?> keywords)
            {
                copy["keywords"] = FilterSemanticTerms(keywords.Select(k => k?.ToString() ?? ""));
            }

            output.Add(copy);
        }

        return output;
    }

    private static List<string> Tokenize(string? term) =>
        System.Text.RegularExpressions.Regex.Matches(term ?? "", @"\b[\w']+\b")
            .Select(m => m.Value.ToLowerInvariant())
            .Where(t => t.Length > 0)
            .ToList();
}
