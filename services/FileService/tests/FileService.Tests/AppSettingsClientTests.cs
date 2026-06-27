using System.Net;
using FileService.Application.Clients;
using FileService.Application.Options;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FileService.Tests;

public class AppSettingsClientTests
{
    [Fact]
    public async Task GetBrandingAsync_disabled_returns_empty_model()
    {
        var client = new AppSettingsClient(
            TestHttpHandler.CreateClient(_ => throw new InvalidOperationException("should not call")),
            Options.Create(new ReportApiOptions { BaseUrl = "http://report-api.test" }),
            new FakeLogoFetcher(),
            NullLogger<AppSettingsClient>.Instance);

        var brand = await client.GetBrandingAsync(false);

        Assert.False(brand.Enabled);
    }

    [Fact]
    public async Task GetBrandingAsync_loads_brand_keys_and_logo()
    {
        using var http = TestHttpHandler.CreateClient(req =>
        {
            if (req.RequestUri!.AbsolutePath.Contains("ui-preferences", StringComparison.OrdinalIgnoreCase))
            {
                return TestHttpHandler.Json(
                    """{"brandName":"Agency Co","brandSubtitle":"Audits","brandLogoUrl":"https://cdn/logo.png"}""");
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });
        var logoFetcher = new FakeLogoFetcher { Bytes = [1, 2, 3] };
        var client = new AppSettingsClient(
            http,
            Options.Create(new ReportApiOptions { BaseUrl = "http://report-api.test" }),
            logoFetcher,
            NullLogger<AppSettingsClient>.Instance);

        var brand = await client.GetBrandingAsync(true);

        Assert.True(brand.Enabled);
        Assert.Equal("Agency Co", brand.AgencyName);
        Assert.Equal("Audits", brand.AgencySubtitle);
        Assert.Equal([1, 2, 3], brand.LogoBytes);
        Assert.Equal("https://cdn/logo.png", logoFetcher.LastUrl);
    }

    [Fact]
    public async Task GetBrandingAsync_ignores_failed_setting_requests()
    {
        using var http = TestHttpHandler.CreateClient(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var client = new AppSettingsClient(
            http,
            Options.Create(new ReportApiOptions { BaseUrl = "http://report-api.test" }),
            new FakeLogoFetcher(),
            NullLogger<AppSettingsClient>.Instance);

        var brand = await client.GetBrandingAsync(true);

        Assert.True(brand.Enabled);
        Assert.Equal("", brand.AgencyName);
    }

    [Fact]
    public async Task LogoFetcher_returns_null_for_empty_url()
    {
        var fetcher = new LogoFetcher(
            TestHttpHandler.CreateClient(_ => throw new InvalidOperationException()),
            NullLogger<LogoFetcher>.Instance);

        var bytes = await fetcher.FetchAsync("  ");

        Assert.Null(bytes);
    }

    [Fact]
    public async Task LogoFetcher_returns_bytes_when_small_enough()
    {
        var fetcher = new LogoFetcher(
            TestHttpHandler.CreateClient(_ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent([5, 6, 7]),
            }),
            NullLogger<LogoFetcher>.Instance);

        var bytes = await fetcher.FetchAsync("https://cdn/logo.png");

        Assert.Equal([5, 6, 7], bytes);
    }

    [Fact]
    public async Task LogoFetcher_returns_null_when_response_too_large()
    {
        var fetcher = new LogoFetcher(
            TestHttpHandler.CreateClient(_ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(new byte[512 * 1024 + 1]),
            }),
            NullLogger<LogoFetcher>.Instance);

        var bytes = await fetcher.FetchAsync("https://cdn/huge.png");

        Assert.Null(bytes);
    }

    private sealed class FakeLogoFetcher : ILogoFetcher
    {
        public byte[]? Bytes { get; set; }
        public string? LastUrl { get; private set; }

        public Task<byte[]?> FetchAsync(string? url, CancellationToken cancellationToken = default)
        {
            LastUrl = url;
            return Task.FromResult<byte[]?>(Bytes);
        }
    }
}
