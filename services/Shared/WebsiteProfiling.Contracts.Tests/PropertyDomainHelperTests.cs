using WebsiteProfiling.Contracts.Properties;

namespace WebsiteProfiling.Contracts.Tests;

public class PropertyDomainHelperTests
{
    [Theory]
    [InlineData("https://example.com", "example.com")]
    [InlineData("http://example.com/path?q=1", "example.com")]
    [InlineData("https://WWW.Example.COM/page", "www.example.com")]
    [InlineData("not a url", "")]
    [InlineData("/relative/path", "")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void ExtractHostname_returns_lowercased_host_or_empty(string? url, string expected)
    {
        Assert.Equal(expected, PropertyDomainHelper.ExtractHostname(url));
    }

    [Theory]
    [InlineData("https://example.com/start", "example.com")]
    [InlineData("http://www.example.com", "www.example.com")]
    // Bare domains (no scheme) are accepted by assuming https.
    [InlineData("example.com", "example.com")]
    [InlineData("WWW.Example.com/page", "www.example.com")]
    [InlineData("  https://example.com  ", "example.com")]
    [InlineData("", "")]
    [InlineData(null, "")]
    [InlineData("   ", "")]
    public void CanonicalDomainFromStartUrl_normalizes_host(string? startUrl, string expected)
    {
        Assert.Equal(expected, PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl));
    }

    [Theory]
    [InlineData("example.com", "", "example.com")]
    [InlineData("example.com", "https://other.com", "example.com")]
    // Whitespace-only domain falls through to the siteUrl (IntegrationsService semantics).
    [InlineData("   ", "https://example.com", "example.com")]
    // Bare-domain siteUrl fallback (Data semantics, kept in the merge).
    [InlineData("", "example.com", "example.com")]
    [InlineData("", "", "Site")]
    [InlineData(null, "not a url", "Site")]
    public void DerivePropertyName_prefers_domain_then_site_url_host(string? domain, string siteUrl, string expected)
    {
        Assert.Equal(expected, PropertyDomainHelper.DerivePropertyName(domain, siteUrl));
    }

    [Theory]
    [InlineData("example.com")]
    [InlineData("www.example.com")]
    [InlineData("sub.domain.example.co.uk")]
    [InlineData("Example.COM")] // case-insensitive
    [InlineData("example.com.")] // trailing dot trimmed
    [InlineData("a-b.io")]
    public void IsValidCanonicalDomain_accepts_real_domains(string domain)
    {
        Assert.True(PropertyDomainHelper.IsValidCanonicalDomain(domain));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("www")] // reserved
    [InlineData("http")] // reserved
    [InlineData("localhost")] // no dot
    [InlineData("a.b")] // too short (< 4 chars)
    [InlineData("example..com")] // empty label
    [InlineData("-example.com")] // label starts with hyphen
    [InlineData("example-.com")] // label ends with hyphen
    [InlineData("example.c")] // single-char TLD
    [InlineData("exa mple.com")] // whitespace in label
    [InlineData("sc-domain:example.com")] // GSC property id, not a hostname
    public void IsValidCanonicalDomain_rejects_invalid_domains(string? domain)
    {
        Assert.False(PropertyDomainHelper.IsValidCanonicalDomain(domain));
    }

    [Fact]
    public void IsValidCanonicalDomain_rejects_labels_longer_than_63_chars()
    {
        var longLabel = new string('a', 64);
        Assert.False(PropertyDomainHelper.IsValidCanonicalDomain($"{longLabel}.com"));
        Assert.True(PropertyDomainHelper.IsValidCanonicalDomain($"{new string('a', 63)}.com"));
    }
}
