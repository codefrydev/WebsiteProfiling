using System.Text.RegularExpressions;
using FileService.Domain.Models;

namespace FileService.Application.Domain;

public static partial class DomainResolver
{
    public static int? ResolveReportId(IReadOnlyList<ReportListRow> reports, string domainQuery)
    {
        var query = NormalizeDomainQuery(domainQuery);
        if (string.IsNullOrEmpty(query))
        {
            return null;
        }

        foreach (var row in reports)
        {
            if (DomainQueryMatchesRow(row, query))
            {
                return row.Id;
            }
        }
        return null;
    }

    public static bool DomainQueryMatchesRow(ReportListRow row, string queryParam)
    {
        var p = NormalizeDomainQuery(queryParam);
        if (string.IsNullOrEmpty(p))
        {
            return false;
        }

        var host = row.CanonicalDomain?.Trim().ToLowerInvariant() ?? "";
        if (!string.IsNullOrEmpty(host) && host == p)
        {
            return true;
        }
        if (Slugify(row.SiteName) == p)
        {
            return true;
        }
        if (!string.IsNullOrEmpty(host) && Slugify(host) == p)
        {
            return true;
        }
        if (!string.IsNullOrEmpty(row.SiteName) && row.SiteName.Trim().ToLowerInvariant() == p)
        {
            return true;
        }
        return false;
    }

    public static string NormalizeDomainQuery(string? param)
    {
        if (string.IsNullOrWhiteSpace(param))
        {
            return "";
        }
        var s = Uri.UnescapeDataString(param.Trim()).ToLowerInvariant();
        return TrailingPunctuation().Replace(s, "");
    }

    public static string Slugify(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "";
        }
        var s = name.Trim().ToLowerInvariant();
        s = NonAlphaNum().Replace(s, "-");
        s = TrimHyphens().Replace(s, "");
        return s;
    }

    [GeneratedRegex(@"[,;.\s]+$")]
    private static partial Regex TrailingPunctuation();

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NonAlphaNum();

    [GeneratedRegex(@"^-+|-+$")]
    private static partial Regex TrimHyphens();
}
