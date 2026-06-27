using System.Text.RegularExpressions;

namespace Data.Application.Properties;

public static partial class PropertyDomainHelper
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "http", "https", "www",
    };

    [GeneratedRegex(@"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", RegexOptions.Compiled)]
    private static partial Regex LabelRegex();

    public static string NormalizeDomain(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "";
        }

        var s = raw.Trim().ToLowerInvariant();
        if (s.StartsWith("https://", StringComparison.Ordinal))
        {
            s = s["https://".Length..];
        }
        else if (s.StartsWith("http://", StringComparison.Ordinal))
        {
            s = s["http://".Length..];
        }

        var slash = s.IndexOf('/');
        if (slash >= 0)
        {
            s = s[..slash];
        }

        return s.TrimEnd('.');
    }

    public static string CanonicalDomainFromStartUrl(string? startUrl)
    {
        var raw = (startUrl ?? "").Trim();
        if (string.IsNullOrEmpty(raw))
        {
            return "";
        }

        var href = raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            ? raw
            : $"https://{raw}";

        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host))
        {
            return "";
        }

        return uri.Host.ToLowerInvariant();
    }

    public static string DerivePropertyName(string domain, string siteUrl = "")
    {
        if (!string.IsNullOrEmpty(domain))
        {
            return domain;
        }

        var host = CanonicalDomainFromStartUrl(siteUrl);
        return string.IsNullOrEmpty(host) ? "Site" : host;
    }

    public static bool IsValidCanonicalDomain(string? domain)
    {
        var d = (domain ?? "").Trim().ToLowerInvariant().TrimEnd('.');
        if (d.Length < 4 || !d.Contains('.', StringComparison.Ordinal) || Reserved.Contains(d))
        {
            return false;
        }

        var labels = d.Split('.');
        foreach (var label in labels)
        {
            if (string.IsNullOrEmpty(label) || label.Length > 63 || !LabelRegex().IsMatch(label))
            {
                return false;
            }
        }

        return labels[^1].Length >= 2;
    }
}
