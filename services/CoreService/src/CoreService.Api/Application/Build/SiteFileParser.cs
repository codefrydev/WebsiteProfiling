using System.Text.RegularExpressions;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python reporting/site_files.py parse helpers.</summary>
public static partial class SiteFileParser
{
    [GeneratedRegex(
        @"^([a-z0-9.\-*]+)\s*,\s*([^,\s]+)\s*,\s*(DIRECT|RESELLER|BUYER)\s*$",
        RegexOptions.IgnoreCase)]
    private static partial Regex AdsLineRegex();

    public static Dictionary<string, object?> ParseAdsTxt(string text)
    {
        var outDict = new Dictionary<string, object?>
        {
            ["ads_txt_present"] = false,
            ["ads_txt_valid"] = false,
            ["ads_txt_line_count"] = 0,
            ["ads_txt_issues"] = new List<string>(),
        };

        if (string.IsNullOrWhiteSpace(text))
        {
            return outDict;
        }

        outDict["ads_txt_present"] = true;
        var validLines = 0;
        var issues = new List<string>();
        var lineNum = 0;
        foreach (var raw in text.Split('\n'))
        {
            lineNum++;
            var line = raw.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#'))
            {
                continue;
            }

            if (AdsLineRegex().IsMatch(line))
            {
                validLines++;
            }
            else
            {
                issues.Add($"invalid_line:{lineNum}");
            }
        }

        outDict["ads_txt_line_count"] = validLines;
        outDict["ads_txt_valid"] = validLines > 0 && issues.Count == 0;
        if (validLines == 0 && outDict["ads_txt_present"] is true)
        {
            issues.Add("no_sellers");
        }

        outDict["ads_txt_issues"] = issues;
        return outDict;
    }

    public static Dictionary<string, object?> ParseSecurityTxt(string text)
    {
        var outDict = new Dictionary<string, object?>
        {
            ["security_txt_present"] = false,
            ["security_txt_valid"] = false,
            ["security_txt_contact"] = new List<string>(),
            ["security_txt_expires"] = null,
        };

        if (string.IsNullOrWhiteSpace(text))
        {
            return outDict;
        }

        outDict["security_txt_present"] = true;
        var contacts = new List<string>();
        string? expires = null;
        var recognized = 0;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#'))
            {
                continue;
            }

            var colon = line.IndexOf(':');
            if (colon < 0)
            {
                continue;
            }

            var key = line[..colon].Trim().ToLowerInvariant();
            var value = line[(colon + 1)..].Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (key == "contact")
            {
                recognized++;
                contacts.Add(value);
            }
            else if (key == "expires")
            {
                recognized++;
                expires = value;
            }
        }

        outDict["security_txt_contact"] = contacts;
        outDict["security_txt_expires"] = expires;
        outDict["security_txt_valid"] = recognized > 0;
        return outDict;
    }

    public static void MergeSiteFileFields(IDictionary<string, object?> target, IReadOnlyDictionary<string, object?> fields)
    {
        foreach (var (key, val) in fields)
        {
            target[key] = val;
        }
    }
}
