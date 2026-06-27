using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using FuzzySharp;
using LanguageIdentification;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python analysis/local.py — deterministic duplicate and language detection.</summary>
public static class LocalEnrichmentBuilder
{
    private static readonly Regex Status2Xx = new(@"^2\d{2}$", RegexOptions.Compiled);
    private static readonly Regex SimhashTokenPattern = new(@"[^\W_]{3,}", RegexOptions.Compiled);

    public static Dictionary<string, object?> CreateEmptyBundle() =>
        new(StringComparer.Ordinal)
        {
            ["content_duplicates"] = Array.Empty<object>(),
            ["url_duplicate_group_id"] = new Dictionary<string, string>(StringComparer.Ordinal),
            ["language_by_url"] = new Dictionary<string, string>(StringComparer.Ordinal),
            ["language_summary"] = new Dictionary<string, object?>
            {
                ["counts"] = new Dictionary<string, int>(StringComparer.Ordinal),
                ["mixed_site"] = false,
            },
            ["spacy_by_url"] = new Dictionary<string, object?>(StringComparer.Ordinal),
            ["similar_internal_by_url"] = new Dictionary<string, List<object?>>(StringComparer.Ordinal),
            ["ner_site_summary"] = new Dictionary<string, object?>(StringComparer.Ordinal),
            ["keyphrases_by_url"] = new Dictionary<string, List<object?>>(StringComparer.Ordinal),
            ["ml_errors"] = new List<string>(),
        };

    public static Dictionary<string, object?> RunLocalEnrichment(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config)
    {
        var bundle = CreateEmptyBundle();
        if (rows.Count == 0)
        {
            return bundle;
        }

        try
        {
            var (dups, urlGid, dupWarnings) = ComputeDuplicateGroups(rows, config);
            bundle["content_duplicates"] = dups;
            bundle["url_duplicate_group_id"] = urlGid;
            AppendMlErrors(bundle, dupWarnings);
        }
        catch (Exception ex)
        {
            AppendMlErrors(bundle, [ex.Message]);
        }

        try
        {
            var (langMap, langSummary) = ComputeLanguageSignals(rows, config);
            bundle["language_by_url"] = langMap;
            bundle["language_summary"] = langSummary;
        }
        catch (Exception ex)
        {
            AppendMlErrors(bundle, [ex.Message]);
        }

        return bundle;
    }

    public static (List<Dictionary<string, object?>> Groups, Dictionary<string, string> UrlToGroupId, List<string> Warnings)
        ComputeDuplicateGroups(IReadOnlyList<CrawlRow> rows, IReadOnlyDictionary<string, string>? config)
    {
        if (rows.Count == 0 || !CfgBool(config, "enable_duplicate_detection"))
        {
            return ([], new Dictionary<string, string>(StringComparer.Ordinal), []);
        }

        var warnings = new List<string>();
        var success = rows.Where(r => Status2Xx.IsMatch((r.Status ?? "").Trim())).ToList();
        success = success
            .Where(r => string.IsNullOrWhiteSpace(r.ContentType)
                        || r.ContentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var maxPages = CfgInt(config, "analysis_dup_max_pages", 2000);
        if (maxPages <= 0)
        {
            maxPages = 2000;
        }

        success = success.Take(maxPages).ToList();

        var urlToFp = new Dictionary<string, string>(StringComparer.Ordinal);
        var urlToSh = new Dictionary<string, ulong>(StringComparer.Ordinal);
        foreach (var row in success)
        {
            var url = NormalizeUrl(row.Url);
            if (string.IsNullOrWhiteSpace(url))
            {
                continue;
            }

            var fp = FingerprintTextHelper.NormalizeFingerprintText(row);
            if (fp.Length < 20)
            {
                continue;
            }

            urlToFp[url] = fp;
            urlToSh[url] = Simhash64(fp);
        }

        var bucket = new Dictionary<ulong, List<string>>();
        foreach (var (url, hash) in urlToSh)
        {
            if (hash == 0)
            {
                continue;
            }

            if (!bucket.TryGetValue(hash, out var members))
            {
                members = [];
                bucket[hash] = members;
            }

            members.Add(url);
        }

        var fuzzyThreshold = CfgInt(config, "analysis_fuzzy_threshold", 92);
        if (fuzzyThreshold <= 0)
        {
            fuzzyThreshold = 92;
        }

        var hammingMax = CfgInt(config, "analysis_simhash_hamming", 0);
        var simhashMaxUrls = CfgInt(config, "analysis_simhash_max_urls", 800);
        if (simhashMaxUrls <= 0)
        {
            simhashMaxUrls = 800;
        }

        var fuzzyMaxUrls = CfgInt(config, "analysis_fuzzy_max_urls", 600);
        if (fuzzyMaxUrls <= 0)
        {
            fuzzyMaxUrls = 600;
        }

        var parent = new Dictionary<string, string>(StringComparer.Ordinal);
        var nodeMethods = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);

        string Find(string x)
        {
            if (parent.TryGetValue(x, out var p) && p != x)
            {
                parent[x] = Find(p);
            }

            return parent.GetValueOrDefault(x, x);
        }

        void Union(string a, string b, string method)
        {
            if (!nodeMethods.TryGetValue(a, out var methodsA))
            {
                methodsA = [];
                nodeMethods[a] = methodsA;
            }

            methodsA.Add(method);

            if (!nodeMethods.TryGetValue(b, out var methodsB))
            {
                methodsB = [];
                nodeMethods[b] = methodsB;
            }

            methodsB.Add(method);

            var ra = Find(a);
            var rb = Find(b);
            if (ra != rb)
            {
                parent[rb] = ra;
            }
        }

        var urls = urlToFp.Keys.ToList();
        foreach (var url in urls)
        {
            parent.TryAdd(url, url);
        }

        foreach (var members in bucket.Values)
        {
            if (members.Count < 2)
            {
                continue;
            }

            var baseline = members[0];
            for (var i = 1; i < members.Count; i++)
            {
                Union(baseline, members[i], "simhash");
            }
        }

        if (hammingMax > 0 && urls.Count <= simhashMaxUrls)
        {
            var shList = urls.Where(u => urlToSh[u] != 0).Select(u => (Url: u, Hash: urlToSh[u])).ToList();
            for (var i = 0; i < shList.Count; i++)
            {
                var (u1, h1) = shList[i];
                for (var j = i + 1; j < shList.Count; j++)
                {
                    var (u2, h2) = shList[j];
                    if (Hamming(h1, h2) <= hammingMax)
                    {
                        Union(u1, u2, "simhash");
                    }
                }
            }
        }
        else if (hammingMax > 0 && urls.Count > simhashMaxUrls)
        {
            warnings.Add(
                $"Duplicate detection: SimHash similarity skipped for {urls.Count} URLs (cap {simhashMaxUrls}); results may be incomplete.");
        }

        if (urls.Count <= fuzzyMaxUrls)
        {
            for (var i = 0; i < urls.Count; i++)
            {
                var u1 = urls[i];
                urlToFp.TryGetValue(u1, out var fp1);
                for (var j = i + 1; j < urls.Count; j++)
                {
                    var u2 = urls[j];
                    urlToFp.TryGetValue(u2, out var fp2);
                    if (string.IsNullOrWhiteSpace(fp1) || string.IsNullOrWhiteSpace(fp2))
                    {
                        continue;
                    }

                    if (Fuzz.TokenSetRatio(fp1, fp2) >= fuzzyThreshold)
                    {
                        Union(u1, u2, "fuzzy");
                    }
                }
            }
        }
        else
        {
            warnings.Add(
                $"Duplicate detection: fuzzy title matching skipped for {urls.Count} URLs (cap {fuzzyMaxUrls}); results may be incomplete.");
        }

        var clusters = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var url in urls)
        {
            var root = Find(url);
            if (!clusters.TryGetValue(root, out var members))
            {
                members = [];
                clusters[root] = members;
            }

            members.Add(url);
        }

        var groupsOut = new List<Dictionary<string, object?>>();
        var urlToGid = new Dictionary<string, string>(StringComparer.Ordinal);
        var gid = 0;
        const int maxGroups = 200;
        foreach (var members in clusters.Values)
        {
            if (members.Count < 2)
            {
                continue;
            }

            var uniqueMembers = members.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
            var representative = uniqueMembers[0];
            var foundMethods = new HashSet<string>(StringComparer.Ordinal);
            foreach (var member in uniqueMembers)
            {
                if (nodeMethods.TryGetValue(member, out var methods))
                {
                    foundMethods.UnionWith(methods);
                }
            }

            var methodsList = foundMethods.Count > 0
                ? foundMethods.Order(StringComparer.Ordinal).ToList()
                : ["simhash"];
            var groupKey = $"dup_{gid}";
            gid++;

            groupsOut.Add(new Dictionary<string, object?>
            {
                ["id"] = groupKey,
                ["representative_url"] = representative,
                ["member_urls"] = uniqueMembers.Take(100).Cast<object?>().ToList(),
                ["member_count"] = uniqueMembers.Count,
                ["methods"] = methodsList.Cast<object?>().ToList(),
            });

            foreach (var member in uniqueMembers)
            {
                urlToGid[member] = groupKey;
            }

            if (gid >= maxGroups)
            {
                break;
            }
        }

        return (groupsOut.Take(maxGroups).ToList(), urlToGid, warnings);
    }

    public static (Dictionary<string, string> ByUrl, Dictionary<string, object?> Summary) ComputeLanguageSignals(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config)
    {
        var emptySummary = new Dictionary<string, object?>
        {
            ["counts"] = new Dictionary<string, int>(StringComparer.Ordinal),
            ["mixed_site"] = false,
        };

        if (rows.Count == 0 || !CfgBool(config, "enable_language_detection"))
        {
            return (new Dictionary<string, string>(StringComparer.Ordinal), emptySummary);
        }

        var byUrl = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var url = NormalizeUrl(row.Url);
            if (string.IsNullOrWhiteSpace(url))
            {
                continue;
            }

            if (!Status2Xx.IsMatch((row.Status ?? "").Trim()))
            {
                continue;
            }

            var text = FingerprintTextHelper.NormalizeFingerprintText(row);
            if (text.Length < 30)
            {
                continue;
            }

            var sample = text.Length <= 2000 ? text : text[..2000];
            try
            {
                using var result = LanguageIdentificationClassifier.Classify(sample);
                var lang = result.LanguageCode?.Trim();
                if (!string.IsNullOrWhiteSpace(lang))
                {
                    byUrl[url] = lang;
                }
            }
            catch (Exception)
            {
                // Skip pages the detector cannot classify (parity with LangDetectException).
            }
        }

        var counts = byUrl.Values
            .GroupBy(l => l, StringComparer.Ordinal)
            .Select(g => new KeyValuePair<string, int>(g.Key, g.Count()))
            .OrderByDescending(kv => kv.Value)
            .Take(20)
            .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);

        var summary = new Dictionary<string, object?>
        {
            ["counts"] = counts,
            ["mixed_site"] = counts.Count > 1,
            ["detected_pages"] = byUrl.Count,
        };

        return (byUrl, summary);
    }

    internal static ulong Simhash64(string text)
    {
        var tokens = SimhashTokenPattern.Matches(text.ToLowerInvariant())
            .Select(m => m.Value)
            .ToList();
        if (tokens.Count == 0)
        {
            return 0;
        }

        var vec = new int[64];
        foreach (var token in tokens)
        {
            var h = StableTokenHash(token);
            for (var i = 0; i < 64; i++)
            {
                if (((h >> i) & 1) == 1)
                {
                    vec[i]++;
                }
                else
                {
                    vec[i]--;
                }
            }
        }

        ulong output = 0;
        for (var i = 0; i < 64; i++)
        {
            if (vec[i] > 0)
            {
                output |= 1UL << i;
            }
        }

        return output;
    }

    private static ulong StableTokenHash(string token)
    {
        var digest = MD5.HashData(Encoding.UTF8.GetBytes(token));
        return BitConverter.ToUInt64(digest, 0);
    }

    private static int Hamming(ulong a, ulong b)
    {
        var x = a ^ b;
        var count = 0;
        while (x != 0)
        {
            count += (int)(x & 1);
            x >>= 1;
        }

        return count;
    }

    private static string NormalizeUrl(string? url) => (url ?? "").Trim().TrimEnd('/');

    private static bool CfgBool(IReadOnlyDictionary<string, string>? config, string key, bool defaultValue = false)
    {
        if (config is null || !config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "true" or "1" or "yes" => true,
            "false" or "0" or "no" => false,
            _ => defaultValue,
        };
    }

    private static int CfgInt(IReadOnlyDictionary<string, string>? config, string key, int defaultValue)
    {
        if (config is null)
        {
            return defaultValue;
        }

        if (!TryReadConfigInt(config, key, out var value))
        {
            var legacyKey = key switch
            {
                "analysis_fuzzy_threshold" => "ml_fuzzy_threshold",
                "analysis_simhash_hamming" => "ml_simhash_hamming",
                "analysis_dup_max_pages" => "ml_dup_max_pages",
                _ => null,
            };

            if (legacyKey is not null && TryReadConfigInt(config, legacyKey, out value))
            {
                return value;
            }

            return defaultValue;
        }

        return value;
    }

    private static bool TryReadConfigInt(IReadOnlyDictionary<string, string> config, string key, out int value)
    {
        value = default;
        if (!config.TryGetValue(key, out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return int.TryParse(raw.Trim(), out value);
    }

    private static void AppendMlErrors(Dictionary<string, object?> bundle, IEnumerable<string> messages)
    {
        if (bundle["ml_errors"] is not List<string> errors)
        {
            errors = [];
            bundle["ml_errors"] = errors;
        }

        errors.AddRange(messages);
    }
}
