using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class SubdomainInventoryBuilderTests
{
    [Fact]
    public async Task BuildAsync_merges_crawl_and_gsc_hosts()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://www.example.com/", Status = "200" },
            new() { Url = "https://www.example.com/about", Status = "200" },
        };

        var indexation = new Dictionary<string, object?>
        {
            ["lists"] = new Dictionary<string, object?>
            {
                ["gsc_not_crawled"] = new List<string> { "https://blog.example.com/post" },
            },
            ["url_join"] = new Dictionary<string, object?>(),
        };

        var builder = new SubdomainInventoryBuilder(new StubHttpClientFactory());
        var outDict = await builder.BuildAsync(
            rows,
            indexation,
            "https://www.example.com/",
            new Dictionary<string, string> { ["subdomain_ct_lookup"] = "false" });

        var hosts = Assert.IsType<List<Dictionary<string, object?>>>(outDict["hosts"]);
        var byHost = hosts.ToDictionary(h => h["host"]!.ToString()!);
        Assert.True(byHost["www.example.com"]["in_crawl"] is true);

        var gscGap = Assert.IsType<List<string>>(outDict["gsc_hosts_not_crawled"]);
        Assert.Contains("blog.example.com", gscGap);
    }

    [Fact]
    public void HostInScope_matches_apex_and_subdomains()
    {
        Assert.True(SubdomainInventoryBuilder.HostInScope("www.example.com", "example.com"));
        Assert.True(SubdomainInventoryBuilder.HostInScope("blog.example.com", "example.com"));
        Assert.False(SubdomainInventoryBuilder.HostInScope("example.org", "example.com"));
    }

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
