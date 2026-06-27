using System.Text.Json;
using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/contact_intelligence.py.</summary>
public static partial class ContactIntelligenceBuilder
{
    private const int ListLimit = 50;

    private static readonly HashSet<string> OrgSchemaTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "organization",
        "localbusiness",
        "corporation",
    };

    [GeneratedRegex(@"/(contact|about|support)(/|$)", RegexOptions.IgnoreCase)]
    private static partial Regex ContactPageRegex();

    public static async Task<Dictionary<string, object?>> BuildAsync(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?> siteLevel,
        string startUrl,
        SiteLevelBuilder siteLevelBuilder,
        IReadOnlyDictionary<string, string>? config = null,
        CancellationToken cancellationToken = default)
    {
        var emails = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);
        var phones = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);
        var addresses = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);
        var orgNames = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);

        var pageScores = new List<(int Score, string Url)>();
        var hasOrgOnHome = false;

        foreach (var row in CategoryHelpers.SuccessRows(rows))
        {
            var url = row.Url.Trim();
            if (string.IsNullOrEmpty(url))
            {
                continue;
            }

            var pa = ParsePageAnalysis(row.PageAnalysisJson);
            var signals = SignalsFromPage(pa);
            var orgSchema = HasOrgSchema(pa);
            var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath : "/";
            if ((path is "/" or "") && orgSchema)
            {
                hasOrgOnHome = true;
            }

            var score = signals.Values.Sum(list => list.Count);
            if (score > 0)
            {
                pageScores.Add((score, url));
            }

            var emailSource = orgSchema ? "json_ld" : "crawl";
            foreach (var email in signals.GetValueOrDefault("emails") ?? [])
            {
                MergeEntry(emails, email, emailSource, url);
            }

            foreach (var phone in signals.GetValueOrDefault("phones") ?? [])
            {
                MergeEntry(phones, phone, "tel_link", url);
            }

            foreach (var addr in signals.GetValueOrDefault("addresses") ?? [])
            {
                MergeEntry(addresses, addr, "json_ld", url);
            }

            foreach (var org in signals.GetValueOrDefault("organization_names") ?? [])
            {
                MergeEntry(orgNames, org, "json_ld", url);
            }
        }

        if (siteLevel.TryGetValue("security_txt_contact", out var contactsObj)
            && contactsObj is IEnumerable<object?> contacts)
        {
            foreach (var contactObj in contacts)
            {
                if (contactObj is not string contact)
                {
                    continue;
                }

                var c = contact.Trim();
                if (c.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
                {
                    MergeEntry(emails, c[7..].Split('?')[0], "security_txt", "");
                }
                else if (c.StartsWith("tel:", StringComparison.OrdinalIgnoreCase))
                {
                    MergeEntry(phones, c[4..].Split('?')[0], "security_txt", "");
                }
                else if (c.Contains('@'))
                {
                    MergeEntry(emails, c, "security_txt", "");
                }
            }
        }

        if (ParseBool(config, "enable_rdap_org_lookup", defaultValue: true))
        {
            var apex = ApexFromStartUrl(startUrl);
            if (!string.IsNullOrEmpty(apex))
            {
                var org = await siteLevelBuilder.FetchRdapOrgNameAsync(apex, cancellationToken);
                if (!string.IsNullOrWhiteSpace(org))
                {
                    MergeEntry(orgNames, org, "whois_org", "");
                }
            }
        }

        string? primaryContactPage = null;
        if (pageScores.Count > 0)
        {
            pageScores.Sort((a, b) =>
            {
                var scoreCmp = b.Score.CompareTo(a.Score);
                return scoreCmp != 0 ? scoreCmp : string.Compare(a.Url, b.Url, StringComparison.Ordinal);
            });

            foreach (var (_, candidate) in pageScores)
            {
                var path = Uri.TryCreate(candidate, UriKind.Absolute, out var uri)
                    ? uri.AbsolutePath
                    : "";
                if (ContactPageRegex().IsMatch(path))
                {
                    primaryContactPage = candidate;
                    break;
                }
            }

            primaryContactPage ??= pageScores[0].Url;
        }

        var consistencyNotes = new List<string>();
        if (emails.Count > 3)
        {
            consistencyNotes.Add($"{emails.Count} distinct email addresses found across the site.");
        }

        if (orgNames.Count > 1)
        {
            consistencyNotes.Add($"{orgNames.Count} distinct organization names found in structured data.");
        }

        if (!hasOrgOnHome)
        {
            consistencyNotes.Add("No Organization (or LocalBusiness) schema detected on the homepage.");
        }

        return new Dictionary<string, object?>
        {
            ["emails"] = ListItems(emails),
            ["phones"] = ListItems(phones),
            ["addresses"] = ListItems(addresses),
            ["organization_names"] = ListItems(orgNames),
            ["primary_contact_page"] = primaryContactPage,
            ["consistency_notes"] = consistencyNotes,
        };
    }

    internal static Dictionary<string, object?> ParsePageAnalysis(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw == "{}")
        {
            return new Dictionary<string, object?>();
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new Dictionary<string, object?>();
            }

            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Array => prop.Value.GetRawText(),
                    JsonValueKind.Object => prop.Value.GetRawText(),
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var n) ? n : prop.Value.GetDouble(),
                    _ => null,
                };
            }

            return dict;
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?>();
        }
    }

    internal static Dictionary<string, List<string>> SignalsFromPage(IReadOnlyDictionary<string, object?> pageAnalysis)
    {
        var outDict = new Dictionary<string, List<string>>();
        if (!pageAnalysis.TryGetValue("contact_signals", out var signalsObj))
        {
            return outDict;
        }

        JsonElement signalsEl;
        switch (signalsObj)
        {
            case JsonElement je when je.ValueKind == JsonValueKind.Object:
                signalsEl = je;
                break;
            case string s when !string.IsNullOrWhiteSpace(s):
                try
                {
                    using var doc = JsonDocument.Parse(s);
                    if (doc.RootElement.ValueKind != JsonValueKind.Object)
                    {
                        return outDict;
                    }

                    return ReadSignals(doc.RootElement);
                }
                catch (JsonException)
                {
                    return outDict;
                }

            default:
                return outDict;
        }

        return ReadSignals(signalsEl);
    }

    private static Dictionary<string, List<string>> ReadSignals(JsonElement signalsEl)
    {
        var outDict = new Dictionary<string, List<string>>();
        foreach (var key in new[] { "emails", "phones", "addresses", "organization_names" })
        {
            if (!signalsEl.TryGetProperty(key, out var arr) || arr.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var values = arr.EnumerateArray()
                .Select(x => x.GetString()?.Trim() ?? "")
                .Where(x => x.Length > 0)
                .ToList();
            if (values.Count > 0)
            {
                outDict[key] = values;
            }
        }

        return outDict;
    }

    internal static bool HasOrgSchema(IReadOnlyDictionary<string, object?> pageAnalysis)
    {
        if (!pageAnalysis.TryGetValue("json_ld_types", out var typesObj))
        {
            return false;
        }

        IEnumerable<string> types;
        switch (typesObj)
        {
            case JsonElement { ValueKind: JsonValueKind.Array } arr:
                types = arr.EnumerateArray().Select(t => t.GetString() ?? "").ToList();
                break;
            case JsonElement { ValueKind: JsonValueKind.String } s:
                types = [s.GetString() ?? ""];
                break;
            case string s when !string.IsNullOrWhiteSpace(s):
                try
                {
                    using var doc = JsonDocument.Parse(s);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        types = doc.RootElement.EnumerateArray()
                            .Select(t => t.GetString() ?? "")
                            .ToList();
                        break;
                    }
                }
                catch (JsonException)
                {
                    // fall through to scalar
                }

                types = [s];
                break;
            case string s:
                types = [s];
                break;
            default:
                return false;
        }

        return types.Any(t => OrgSchemaTypes.Contains(t.Trim()));
    }

    internal static void MergeEntry(
        Dictionary<string, Dictionary<string, object?>> bucket,
        string value,
        string source,
        string url)
    {
        var val = value.Trim();
        if (string.IsNullOrEmpty(val))
        {
            return;
        }

        var key = val.ToLowerInvariant();
        if (!bucket.TryGetValue(key, out var entry))
        {
            entry = new Dictionary<string, object?>
            {
                ["value"] = val,
                ["sources"] = new List<string>(),
                ["urls"] = new List<string>(),
            };
            bucket[key] = entry;
        }

        var sources = (List<string>)entry["sources"]!;
        if (!sources.Contains(source))
        {
            sources.Add(source);
        }

        if (!string.IsNullOrEmpty(url))
        {
            var urls = (List<string>)entry["urls"]!;
            if (!urls.Contains(url))
            {
                urls.Add(url);
            }
        }
    }

    private static List<Dictionary<string, object?>> ListItems(
        Dictionary<string, Dictionary<string, object?>> bucket) =>
        bucket.Values.Take(ListLimit).ToList();

    private static string ApexFromStartUrl(string startUrl)
    {
        if (!Uri.TryCreate(startUrl.Trim(), UriKind.Absolute, out var uri))
        {
            return "";
        }

        var host = uri.Host.ToLowerInvariant();
        return host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host;
    }

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
