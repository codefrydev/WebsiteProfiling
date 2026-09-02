using System.Text.Json;

namespace CoreService.Api.Application.Build.Categories;

public static class IntelligenceCategoryBuilder
{
    public static ReportCategory Build(IReadOnlyDictionary<string, object?>? mlBundle)
    {
        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();
        mlBundle ??= new Dictionary<string, object?>();

        var dups = ParseDuplicateGroups(mlBundle);
        if (dups.Count > 0)
        {
            var big = dups.Where(g => g.MemberCount >= 3).ToList();
            if (big.Count > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"Near-duplicate content: {big.Count} group(s) with 3+ URLs.",
                    priority: "High",
                    recommendation: "Consolidate or canonicalize duplicate pages; differentiate thin similar URLs."));
                deductions.Add((Math.Min(20, 5 + big.Count), true));
            }
            else
            {
                issues.Add(CategoryHelpers.Issue(
                    $"Possible duplicate content: {dups.Count} pair/group(s) detected.",
                    priority: "Medium",
                    recommendation: "Review clusters and add canonicals or noindex where appropriate."));
                deductions.Add((8, true));
            }
        }

        if (TryGetLanguageSummary(mlBundle, out var lang)
            && GetBool(lang, "mixed_site") == true
            && GetInt(lang, "detected_pages") is >= 10)
        {
            var counts = GetStringIntMap(lang, "counts");
            var top = counts.OrderByDescending(kv => kv.Value).Take(3).ToList();
            var desc = top.Count > 0
                ? string.Join(", ", top.Select(kv => $"{kv.Key}:{kv.Value}"))
                : "multiple";
            issues.Add(CategoryHelpers.Issue(
                $"Mixed languages detected across pages ({desc}).",
                priority: "Medium",
                recommendation: "Ensure hreflang and localized URLs match user intent; split sitemaps if needed."));
            deductions.Add((5, true));
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "intelligence",
            "Content quality",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }

    private sealed record DuplicateGroup(int MemberCount, IReadOnlyList<string> MemberUrls);

    private static List<DuplicateGroup> ParseDuplicateGroups(IReadOnlyDictionary<string, object?> mlBundle)
    {
        var groups = new List<DuplicateGroup>();
        if (!mlBundle.TryGetValue("content_duplicates", out var raw))
        {
            return groups;
        }

        if (raw is JsonElement el && el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var urls = new List<string>();
                if (item.TryGetProperty("member_urls", out var urlsEl) && urlsEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var u in urlsEl.EnumerateArray())
                    {
                        if (u.ValueKind == JsonValueKind.String)
                        {
                            var s = u.GetString();
                            if (!string.IsNullOrWhiteSpace(s))
                            {
                                urls.Add(s);
                            }
                        }
                    }
                }

                var memberCount = item.TryGetProperty("member_count", out var countEl) && countEl.TryGetInt32(out var c)
                    ? c
                    : urls.Count;
                groups.Add(new DuplicateGroup(memberCount, urls));
            }

            return groups;
        }

        if (raw is IEnumerable<object?> list)
        {
            foreach (var item in list)
            {
                if (item is not Dictionary<string, object?> group)
                {
                    continue;
                }

                var urls = new List<string>();
                if (group.TryGetValue("member_urls", out var urlsRaw) && urlsRaw is IEnumerable<object?> urlList)
                {
                    foreach (var u in urlList)
                    {
                        var s = u?.ToString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(s))
                        {
                            urls.Add(s);
                        }
                    }
                }

                var memberCount = group.TryGetValue("member_count", out var countRaw) && countRaw is int c
                    ? c
                    : urls.Count;
                groups.Add(new DuplicateGroup(memberCount, urls));
            }
        }

        return groups;
    }

    private static bool TryGetLanguageSummary(
        IReadOnlyDictionary<string, object?> mlBundle,
        out Dictionary<string, object?> lang)
    {
        lang = new Dictionary<string, object?>();
        if (!mlBundle.TryGetValue("language_summary", out var raw) || raw is null)
        {
            return false;
        }

        if (raw is Dictionary<string, object?> dict)
        {
            lang = new Dictionary<string, object?>(dict);
            return true;
        }

        if (raw is not JsonElement el || el.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var prop in el.EnumerateObject())
        {
            lang[prop.Name] = prop.Value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => prop.Value.GetString(),
                JsonValueKind.Number when prop.Value.TryGetInt32(out var n) => n,
                JsonValueKind.Object => prop.Value,
                _ => null,
            };
        }

        return true;
    }

    private static Dictionary<string, int> GetStringIntMap(Dictionary<string, object?> dict, string key)
    {
        var result = new Dictionary<string, int>(StringComparer.Ordinal);
        if (!dict.TryGetValue(key, out var raw) || raw is null)
        {
            return result;
        }

        if (raw is Dictionary<string, int> intDict)
        {
            return new Dictionary<string, int>(intDict, StringComparer.Ordinal);
        }

        if (raw is JsonElement el && el.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in el.EnumerateObject())
            {
                if (prop.Value.TryGetInt32(out var n))
                {
                    result[prop.Name] = n;
                }
            }
        }

        return result;
    }

    private static bool? GetBool(Dictionary<string, object?> dict, string key)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
        {
            return null;
        }

        return val switch
        {
            bool b => b,
            JsonElement { ValueKind: JsonValueKind.True } => true,
            JsonElement { ValueKind: JsonValueKind.False } => false,
            _ => null,
        };
    }

    private static int? GetInt(Dictionary<string, object?> dict, string key)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
        {
            return null;
        }

        return val switch
        {
            int i => i,
            JsonElement el when el.TryGetInt32(out var n) => n,
            _ => null,
        };
    }
}
