using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>
/// Passive security findings from crawl data (Python security_scanner passive checks; no active probes).
/// </summary>
public static class SecurityScanBuilder
{
    private static readonly HashSet<string> OpenRedirectParams = new(StringComparer.OrdinalIgnoreCase)
    {
        "redirect", "url", "next", "return", "returnUrl", "return_url", "redir", "destination", "dest", "target", "goto", "out", "view", "to",
    };

    public static List<Dictionary<string, object?>> BuildPassive(
        IReadOnlyList<CrawlRow> rows,
        string startUrl,
        bool enabled = true)
    {
        if (!enabled)
        {
            return [];
        }

        var findings = new List<Dictionary<string, object?>>();
        findings.AddRange(PassiveHeaders(rows));
        findings.AddRange(PassiveHttps(rows));
        findings.AddRange(PassiveOpenRedirectRisk(rows, startUrl));
        findings.AddRange(PassiveMixedContent(rows, startUrl));
        return findings;
    }

    private static IEnumerable<Dictionary<string, object?>> PassiveHeaders(IReadOnlyList<CrawlRow> rows)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in CategoryHelpers.SuccessRows(rows))
        {
            var url = row.Url.Trim();
            if (url.Length == 0)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.StrictTransportSecurity) && seen.Add("missing_hsts"))
            {
                yield return Finding(
                    "missing_hsts", "High", url,
                    "Strict-Transport-Security header not set.",
                    "Add Strict-Transport-Security (e.g. max-age=31536000; includeSubDomains) to enforce HTTPS.");
            }

            if (string.IsNullOrWhiteSpace(row.XContentTypeOptions) && seen.Add("missing_x_content_type_options"))
            {
                yield return Finding(
                    "missing_x_content_type_options", "Medium", url,
                    "X-Content-Type-Options header not set.",
                    "Add X-Content-Type-Options: nosniff to prevent MIME sniffing.");
            }

            if (string.IsNullOrWhiteSpace(row.XFrameOptions) && seen.Add("missing_x_frame_options"))
            {
                yield return Finding(
                    "missing_x_frame_options", "Medium", url,
                    "X-Frame-Options header not set.",
                    "Add X-Frame-Options: DENY or SAMEORIGIN to reduce clickjacking risk.");
            }

            if (string.IsNullOrWhiteSpace(row.ContentSecurityPolicy) && seen.Add("missing_csp"))
            {
                yield return Finding(
                    "missing_csp", "Medium", url,
                    "Content-Security-Policy header not set.",
                    "Add a Content-Security-Policy to mitigate XSS and injection.");
            }
        }
    }

    private static IEnumerable<Dictionary<string, object?>> PassiveHttps(IReadOnlyList<CrawlRow> rows)
    {
        foreach (var row in rows)
        {
            var final = (row.FinalUrl ?? "").Trim();
            if (final.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            {
                yield return Finding(
                    "http_final_url", "Critical", row.Url,
                    "URL resolves to HTTP (insecure).",
                    "Ensure all pages redirect to HTTPS.",
                    final);
            }
        }
    }

    private static IEnumerable<Dictionary<string, object?>> PassiveOpenRedirectRisk(
        IReadOnlyList<CrawlRow> rows,
        string startUrl)
    {
        if (!Uri.TryCreate(startUrl, UriKind.Absolute, out var startUri))
        {
            yield break;
        }

        var startHost = startUri.Host.ToLowerInvariant();
        foreach (var row in rows)
        {
            if (!Uri.TryCreate(row.Url, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Query))
            {
                continue;
            }

            var query = uri.Query.TrimStart('?');
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                var key = Uri.UnescapeDataString(eq >= 0 ? part[..eq] : part);
                if (!OpenRedirectParams.Contains(key))
                {
                    continue;
                }

                var value = Uri.UnescapeDataString(eq >= 0 ? part[(eq + 1)..] : "");
                if (string.IsNullOrWhiteSpace(value)
                    || !value.Trim().StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                       && !value.Trim().StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var target)
                    && !string.Equals(target.Host, startHost, StringComparison.OrdinalIgnoreCase))
                {
                    yield return Finding(
                        "open_redirect_risk", "Low", row.Url,
                        $"Query parameter '{key}' contains external URL (potential open redirect).",
                        "Validate redirect targets to same origin or allowlist; do not redirect to user-controlled URLs.",
                        value.Trim()[..Math.Min(200, value.Trim().Length)]);
                    break;
                }
            }
        }
    }

    private static IEnumerable<Dictionary<string, object?>> PassiveMixedContent(
        IReadOnlyList<CrawlRow> rows,
        string startUrl)
    {
        if (!startUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            yield break;
        }

        foreach (var row in CategoryHelpers.SuccessRows(rows))
        {
            var mixed = row.MixedContentCount ?? 0;
            if (mixed <= 0)
            {
                continue;
            }

            yield return Finding(
                "mixed_content", "High", row.Url,
                $"Page loads {mixed} HTTP resource(s) over HTTPS (mixed content).",
                "Load all resources over HTTPS to avoid mixed content and downgrade attacks.",
                mixed.ToString());
        }
    }

    private static Dictionary<string, object?> Finding(
        string findingType,
        string severity,
        string url,
        string message,
        string recommendation,
        string? evidence = null)
    {
        var dict = new Dictionary<string, object?>
        {
            ["finding_type"] = findingType,
            ["severity"] = severity,
            ["url"] = url,
            ["message"] = message,
            ["recommendation"] = recommendation,
        };
        if (evidence is not null)
        {
            dict["evidence"] = evidence;
        }

        return dict;
    }
}
