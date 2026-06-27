namespace AiService.Tools.Slice;

/// <summary>
/// URL normalization for joining crawl URLs with GSC pages and GA4 paths. Faithful port of
/// Python <c>website_profiling.integrations.google.normalize</c> (urlparse semantics: netloc is
/// only populated when the URL contains <c>//</c>).
/// </summary>
public static class GoogleUrl
{
    /// <summary>Strip scheme, leading <c>www.</c>; lowercase host — for join keys.</summary>
    public static string NormalizeUrl(string? url)
    {
        var (netloc, path) = Split(url?.Trim() ?? string.Empty);
        var host = StripWwwPrefix(netloc.ToLowerInvariant());
        var normalizedPath = path.Length == 0 ? "/" : path;
        return host + normalizedPath;
    }

    /// <summary>Just the path component of a URL (or <c>/</c>). Mirrors Python <c>url_to_path</c>.</summary>
    public static string UrlToPath(string? url)
    {
        var (_, path) = Split(url?.Trim() ?? string.Empty);
        return path.Length == 0 ? "/" : path;
    }

    /// <summary>Remove a single leading <c>www.</c> label (case-insensitive). Mirrors Python <c>strip_www_prefix</c>.</summary>
    public static string StripWwwPrefix(string host)
    {
        var h = host ?? string.Empty;
        return h.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? h[4..] : h;
    }

    /// <summary>
    /// Replicates the subset of <c>urllib.parse.urlparse</c> that <c>normalize_url</c> relies on:
    /// strip a leading <c>scheme:</c>, treat the remainder after <c>//</c> as netloc, and return the
    /// path component (query/fragment stripped). When there is no <c>//</c>, netloc is empty and the
    /// whole remainder is the path.
    /// </summary>
    private static (string Netloc, string Path) Split(string url)
    {
        var rest = url;

        var colon = rest.IndexOf(':');
        if (colon > 0 && IsScheme(rest[..colon]))
        {
            rest = rest[(colon + 1)..];
        }

        string netloc;
        string remainder;
        if (rest.StartsWith("//", StringComparison.Ordinal))
        {
            rest = rest[2..];
            var sep = rest.IndexOfAny(['/', '?', '#']);
            if (sep < 0)
            {
                netloc = rest;
                remainder = string.Empty;
            }
            else
            {
                netloc = rest[..sep];
                remainder = rest[sep..];
            }
        }
        else
        {
            netloc = string.Empty;
            remainder = rest;
        }

        // parsed.path stops at query/fragment.
        var cut = remainder.IndexOfAny(['?', '#']);
        var path = cut < 0 ? remainder : remainder[..cut];
        return (netloc, path);
    }

    private static bool IsScheme(string s)
    {
        if (s.Length == 0 || !char.IsLetter(s[0]))
        {
            return false;
        }

        foreach (var ch in s)
        {
            if (!char.IsLetterOrDigit(ch) && ch is not ('+' or '-' or '.'))
            {
                return false;
            }
        }

        return true;
    }
}
