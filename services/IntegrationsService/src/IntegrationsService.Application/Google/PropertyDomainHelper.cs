using System.Text.RegularExpressions;

namespace IntegrationsService.Application.Google;

public static partial class PropertyDomainHelper
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "http", "https", "www",
    };

    [GeneratedRegex(@"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", RegexOptions.CultureInvariant)]
    private static partial Regex LabelRegex();

    public static string ExtractHostname(string url)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed))
            {
                return "";
            }

            return parsed.Host.ToLowerInvariant();
        }
        catch
        {
            return "";
        }
    }

    public static string CanonicalDomainFromStartUrl(string startUrl)
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

        return ExtractHostname(href);
    }

    public static string DerivePropertyName(string domain, string siteUrl = "")
    {
        if (!string.IsNullOrWhiteSpace(domain))
        {
            return domain;
        }

        var host = ExtractHostname(siteUrl);
        return string.IsNullOrEmpty(host) ? "Site" : host;
    }

    public static bool IsValidCanonicalDomain(string domain)
    {
        var d = (domain ?? "").Trim().ToLowerInvariant().TrimEnd('.');
        if (d.Length < 4 || !d.Contains('.', StringComparison.Ordinal) || Reserved.Contains(d))
        {
            return false;
        }

        var labels = d.Split('.');
        if (labels.Length < 2)
        {
            return false;
        }

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
