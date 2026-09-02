using System.Text.Json;
using System.Text.RegularExpressions;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python tools/keywords.py + content_analytics._build_keyword_opportunities.</summary>
public static class KeywordOpportunitiesBuilder
{
    private static readonly Dictionary<string, double> DefaultWeights = new(StringComparer.Ordinal)
    {
        ["volume"] = 0.40,
        ["relevance"] = 0.30,
        ["ctr_est"] = 0.15,
        ["ease"] = 0.15,
    };

    private static readonly Regex TokenRegex = new(@"\b[\w']+\b", RegexOptions.Compiled);
    private static readonly Regex SlugWordRegex = new(@"\b[\w']+\b", RegexOptions.Compiled);
    private static readonly Regex Status2Xx = new(@"^2\d{2}$", RegexOptions.Compiled);

    public static Dictionary<string, object?> Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config,
        IReadOnlyDictionary<string, object?>? googleData = null)
    {
        if (!ParseBool(config, "include_keyword_opportunities", defaultValue: true))
        {
            return new Dictionary<string, object?>();
        }

        var empty = new Dictionary<string, object?>
        {
            ["quick_wins"] = Array.Empty<object>(),
            ["high_value"] = Array.Empty<object>(),
            ["token_topic_clusters"] = Array.Empty<object>(),
        };

        if (rows.Count == 0)
        {
            return empty;
        }

        var success = rows.Where(r => Status2Xx.IsMatch(r.Status?.Trim() ?? "")).ToList();
        if (success.Count == 0)
        {
            return empty;
        }

        var candidates = ExtractCandidates(success);
        if (candidates.Count == 0)
        {
            return empty;
        }

        var corpusSize = success.Count;
        var gscPositions = BuildGscPositionLookup(googleData);
        var scored = ScoreKeywords(candidates, corpusSize, gscPositions: gscPositions);
        var clusters = TextHygieneHelper.FilterTopicClusters(ClusterKeywords(scored)).Take(50).ToList();
        var quickWins = scored.Where(s => GetDouble(s, "difficulty") < 60).Take(10).ToList();
        var highValue = scored.Where(s => GetDouble(s, "volume") >= 0.5).Take(10).ToList();
        if (highValue.Count == 0)
        {
            highValue = scored.Take(10).ToList();
        }

        return new Dictionary<string, object?>
        {
            ["quick_wins"] = quickWins,
            ["high_value"] = highValue,
            ["token_topic_clusters"] = clusters,
        };
    }

    private static Dictionary<string, CandidateData> ExtractCandidates(IReadOnlyList<CrawlRow> rows)
    {
        var candidates = new Dictionary<string, CandidateData>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var url = row.Url?.Trim() ?? "";
            if (url.Length == 0 || row.Status?.StartsWith('4') == true || row.Status?.StartsWith('5') == true)
            {
                continue;
            }

            var allTokens = new List<string>();
            foreach (var text in new[] { row.Title, row.MetaDescription, row.H1 })
            {
                if (!string.IsNullOrWhiteSpace(text))
                {
                    allTokens.AddRange(Tokenize(text));
                }
            }

            allTokens.AddRange(SlugTokens(url));
            foreach (var (word, count) in ParseTopKeywords(row.TopKeywords))
            {
                AddCandidate(candidates, word, url, count);
            }

            if (allTokens.Count == 0)
            {
                continue;
            }

            for (var n = 1; n <= 4; n++)
            {
                foreach (var ng in Ngrams(allTokens, n))
                {
                    if (ng.Length < 2)
                    {
                        continue;
                    }

                    AddCandidate(candidates, ng, url);
                }
            }
        }

        return candidates;
    }

    private static List<Dictionary<string, object?>> ScoreKeywords(
        Dictionary<string, CandidateData> candidates,
        int corpusSize,
        IReadOnlyDictionary<string, double>? weights = null,
        IReadOnlyDictionary<string, double>? gscPositions = null)
    {
        weights ??= DefaultWeights;
        gscPositions ??= new Dictionary<string, double>(StringComparer.Ordinal);
        var relevanceScores = RelevanceTfIdf(candidates, corpusSize);
        var results = new List<Dictionary<string, object?>>();

        foreach (var (kw, data) in candidates)
        {
            if (TextHygieneHelper.IsJunkSemanticTerm(kw))
            {
                continue;
            }

            var rawVol = data.Count / (double)Math.Max(corpusSize, 1);
            var volume = Math.Min(1.0, rawVol);
            gscPositions.TryGetValue(kw, out var gscPosition);
            var hasGscRank = gscPosition > 0;
            var difficulty = EstimateDifficulty(kw, data.Count, corpusSize, hasGscRank ? gscPosition : null);
            var ease = 1.0 - (difficulty / 100.0);
            var relevance = relevanceScores.GetValueOrDefault(kw, 0.5);
            var ctrEst = hasGscRank
                ? CtrCurve.IndustryCtrFraction(gscPosition)
                : 0.05;
            var score =
                weights.GetValueOrDefault("volume", 0.4) * volume
                + weights.GetValueOrDefault("relevance", 0.3) * relevance
                + weights.GetValueOrDefault("ctr_est", 0.15) * ctrEst
                + weights.GetValueOrDefault("ease", 0.15) * ease;

            var action = data.Sources.Count > 1
                ? "internal link"
                : relevance > 0.7
                    ? "optimize page"
                    : "create content";

            results.Add(new Dictionary<string, object?>
            {
                ["keyword"] = kw,
                ["score"] = Math.Round(score, 4),
                ["volume"] = Math.Round(volume, 4),
                ["difficulty"] = difficulty,
                ["difficulty_estimated"] = !hasGscRank,
                ["relevance"] = Math.Round(relevance, 4),
                ["ctr_est"] = Math.Round(ctrEst, 4),
                ["current_rank"] = hasGscRank ? gscPosition : null,
                ["recommended_action"] = action,
                ["source"] = "site",
                ["data_source"] = hasGscRank ? "gsc+crawl" : "crawl_heuristic",
                ["sources_count"] = data.Sources.Count,
            });
        }

        return results.OrderByDescending(r => GetDouble(r, "score")).ToList();
    }

    private static double EstimateDifficulty(string keyword, int count, int corpusSize, double? gscPosition)
    {
        var baseDifficulty = 50.0;
        var words = keyword.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length >= 4)
        {
            baseDifficulty -= 20;
        }
        else if (words.Length == 1)
        {
            baseDifficulty += 15;
        }

        var siteFreq = count / (double)Math.Max(corpusSize, 1);
        baseDifficulty += 70 * (1.0 - siteFreq);

        if (gscPosition is > 0)
        {
            if (gscPosition < 5)
            {
                baseDifficulty -= 15;
            }
            else if (gscPosition < 20)
            {
                baseDifficulty -= 8;
            }
        }

        return Math.Clamp(baseDifficulty, 0, 100);
    }

    private static Dictionary<string, double> BuildGscPositionLookup(IReadOnlyDictionary<string, object?>? googleData)
    {
        var lookup = new Dictionary<string, double>(StringComparer.Ordinal);
        if (googleData is null)
        {
            return lookup;
        }

        if (JsonObjectParser.AsDict(googleData.GetValueOrDefault("gsc")) is not { } gsc)
        {
            return lookup;
        }

        foreach (var row in JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("top_queries")))
        {
            var query = row.GetValueOrDefault("query")?.ToString()?.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(query))
            {
                continue;
            }

            var position = ToDouble(row.GetValueOrDefault("position"));
            if (position <= 0)
            {
                continue;
            }

            if (!lookup.TryGetValue(query, out var existing) || position < existing)
            {
                lookup[query] = position;
            }
        }

        return lookup;
    }

    private static double ToDouble(object? value) =>
        value switch
        {
            null => 0,
            double d => d,
            float f => f,
            int i => i,
            long l => l,
            decimal m => (double)m,
            string s when double.TryParse(s, out var parsed) => parsed,
            _ => 0,
        };

    private static List<Dictionary<string, object?>> ClusterKeywords(
        IReadOnlyList<Dictionary<string, object?>> scored)
    {
        if (scored.Count == 0)
        {
            return [];
        }

        var kwToTokens = scored.ToDictionary(
            s => s.GetValueOrDefault("keyword")?.ToString() ?? "",
            s => new HashSet<string>(Tokenize(s.GetValueOrDefault("keyword")?.ToString() ?? ""), StringComparer.Ordinal),
            StringComparer.Ordinal);

        var used = new HashSet<string>(StringComparer.Ordinal);
        var kwList = scored.Select(s => s.GetValueOrDefault("keyword")?.ToString() ?? "").ToList();
        var clusters = new List<HashSet<string>>();

        foreach (var s in scored)
        {
            var kw = s.GetValueOrDefault("keyword")?.ToString() ?? "";
            if (TextHygieneHelper.IsJunkSemanticTerm(kw) || used.Contains(kw))
            {
                continue;
            }

            var cluster = new HashSet<string>(StringComparer.Ordinal) { kw };
            used.Add(kw);
            var tokens = new HashSet<string>(kwToTokens.GetValueOrDefault(kw, []), StringComparer.Ordinal);

            foreach (var other in kwList)
            {
                if (used.Contains(other))
                {
                    continue;
                }

                if (!tokens.Overlaps(kwToTokens.GetValueOrDefault(other, [])))
                {
                    continue;
                }

                cluster.Add(other);
                used.Add(other);
                foreach (var t in kwToTokens.GetValueOrDefault(other, []))
                {
                    tokens.Add(t);
                }
            }

            clusters.Add(cluster);
        }

        var scoreByKw = scored.ToDictionary(
            s => s.GetValueOrDefault("keyword")?.ToString() ?? "",
            s => GetDouble(s, "score"),
            StringComparer.Ordinal);

        var output = new List<Dictionary<string, object?>>();
        foreach (var cluster in clusters)
        {
            if (cluster.Count == 0)
            {
                continue;
            }

            var topKw = cluster.MaxBy(k => scoreByKw.GetValueOrDefault(k, 0)) ?? cluster.First();
            var scoresIn = cluster.Select(k => scoreByKw.GetValueOrDefault(k, 0)).ToList();
            var clusterScore = scoresIn.Count > 0 ? scoresIn.Sum() / scoresIn.Count : 0;
            output.Add(new Dictionary<string, object?>
            {
                ["top_keyword"] = topKw,
                ["cluster_score"] = Math.Round(clusterScore, 4),
                ["keywords"] = cluster.OrderBy(k => k, StringComparer.Ordinal).ToList(),
            });
        }

        return output.OrderByDescending(c => GetDouble(c, "cluster_score")).ToList();
    }

    private sealed class CandidateData
    {
        public HashSet<string> Sources { get; } = new(StringComparer.Ordinal);
        public int Count { get; set; }
    }

    private static void AddCandidate(
        Dictionary<string, CandidateData> candidates,
        string keyword,
        string url,
        int weight = 1)
    {
        var kw = keyword.Trim().ToLowerInvariant();
        if (kw.Length < 2 || TextHygieneHelper.IsJunkSemanticTerm(kw))
        {
            return;
        }

        if (!candidates.TryGetValue(kw, out var data))
        {
            data = new CandidateData();
            candidates[kw] = data;
        }

        data.Sources.Add(url);
        data.Count += Math.Max(1, weight);
    }

    private static Dictionary<string, double> RelevanceTfIdf(
        Dictionary<string, CandidateData> candidates,
        int corpusSize)
    {
        var totalDocs = corpusSize > 0 ? corpusSize : 1;
        var scores = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var (kw, data) in candidates)
        {
            var docFreq = Math.Max(data.Sources.Count, 1);
            var idf = 1.0 + Math.Log(totalDocs / (double)docFreq);
            var tf = Math.Min(1.0, data.Count / (double)Math.Max(totalDocs, 1));
            scores[kw] = Math.Min(1.0, (tf * idf) / 10.0);
        }

        return scores;
    }

    private static List<(string Word, int Count)> ParseTopKeywords(string? raw)
    {
        var output = new List<(string Word, int Count)>();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return output;
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return output;
            }

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var word = item.TryGetProperty("word", out var w) ? w.GetString()?.Trim().ToLowerInvariant() : null;
                if (string.IsNullOrEmpty(word) || word.Length < 3 || TextHygieneHelper.IsJunkSemanticTerm(word))
                {
                    continue;
                }

                var count = item.TryGetProperty("count", out var c) && c.TryGetInt32(out var n) ? Math.Max(1, n) : 1;
                output.Add((word, count));
            }
        }
        catch (JsonException)
        {
            // ignore malformed payload
        }

        return output;
    }

    private static List<string> SlugTokens(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return [];
        }

        var path = uri.AbsolutePath.Trim('/');
        if (path.Length == 0)
        {
            return [];
        }

        var skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "html", "php", "asp", "aspx", "jsp",
        };

        var output = new List<string>();
        foreach (var seg in path.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (skip.Contains(seg))
            {
                continue;
            }

            var normalized = seg.Replace('-', ' ').Replace('_', ' ');
            foreach (Match m in SlugWordRegex.Matches(normalized.ToLowerInvariant()))
            {
                output.Add(NormalizeToken(m.Value));
            }
        }

        return output.Where(t => t.Length > 0).ToList();
    }

    private static List<string> Ngrams(IReadOnlyList<string> tokens, int n)
    {
        if (n <= 0 || n > tokens.Count)
        {
            return [];
        }

        var output = new List<string>();
        for (var i = 0; i <= tokens.Count - n; i++)
        {
            output.Add(string.Join(' ', tokens.Skip(i).Take(n)));
        }

        return output;
    }

    private static List<string> Tokenize(string text)
    {
        return TokenRegex.Matches(text.ToLowerInvariant())
            .Select(m => NormalizeToken(m.Value))
            .Where(t => t.Length > 0)
            .ToList();
    }

    private static string NormalizeToken(string token) =>
        Regex.Replace(token.ToLowerInvariant().Trim(), @"[^\w\s]", "").Trim();

    private static double GetDouble(IReadOnlyDictionary<string, object?> dict, string key) =>
        dict.TryGetValue(key, out var val) && val is not null && double.TryParse(val.ToString(), out var d) ? d : 0;

    private static bool ParseBool(IReadOnlyDictionary<string, string>? config, string key, bool defaultValue)
    {
        if (config is null || !config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "0" or "false" or "no" or "off" => false,
            "1" or "true" or "yes" or "on" => true,
            _ => defaultValue,
        };
    }
}
