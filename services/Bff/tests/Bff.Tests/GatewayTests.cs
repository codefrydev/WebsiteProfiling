using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Bff.Application;
using Bff.Application.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bff.Tests;

public class GatewayTests
{
    private const string Secret = "test-secret-123";

    [Fact]
    public async Task Health_returns_ok_without_auth()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Passthrough_forwards_to_fastapi_and_returns_body()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta?x=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/report/meta", body); // upstream echoes the forwarded path
    }

    [Fact]
    public async Task Read_requires_authentication_when_auth_enabled()
    {
        using var factory = new BffFactory(secret: Secret);
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Read_allowed_for_readonly_role()
    {
        using var factory = new BffFactory(secret: Secret);
        var response = await Send(factory, HttpMethod.Get, "/api/report/meta", "viewer");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Mutate_requires_authentication()
    {
        using var factory = new BffFactory(secret: Secret);
        var client = factory.CreateClient();
        var response = await client.PostAsync("/api/run", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Mutate_forbidden_for_readonly_role()
    {
        using var factory = new BffFactory(secret: Secret);
        var response = await Send(factory, HttpMethod.Post, "/api/run", "client-readonly");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mutate_allowed_for_analyst_role()
    {
        using var factory = new BffFactory(secret: Secret);
        var response = await Send(factory, HttpMethod.Post, "/api/run", "analyst");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Chat_allowed_for_client_readonly_but_not_viewer()
    {
        using var factory = new BffFactory(secret: Secret);
        var ok = await Send(factory, HttpMethod.Post, "/api/chat", "client-readonly");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        var forbidden = await Send(factory, HttpMethod.Post, "/api/chat", "viewer");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Session_endpoint_reflects_role()
    {
        using var factory = new BffFactory(secret: Secret);
        var response = await Send(factory, HttpMethod.Get, "/api/auth/session", "analyst");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("authEnabled").GetBoolean());
        Assert.True(doc.RootElement.GetProperty("authenticated").GetBoolean());
        Assert.Equal("analyst", doc.RootElement.GetProperty("role").GetString());
        Assert.True(doc.RootElement.GetProperty("canMutate").GetBoolean());
    }

    [Fact]
    public async Task Pdf_export_preserves_content_type_and_disposition()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/export?format=pdf&reportId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.NotNull(response.Content.Headers.ContentDisposition);
    }

    [Fact]
    public async Task Cors_preflight_echoes_origin_with_credentials()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/report/meta");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        var response = await client.SendAsync(request);

        Assert.Equal("http://localhost:3000", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
    }

    private static async Task<HttpResponseMessage> Send(BffFactory factory, HttpMethod method, string path, string role)
    {
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(method, path);
        var token = WpSessionTokens.Create(role, Secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), 604800);
        request.Headers.Add("Cookie", $"{WpSessionTokens.CookieName}={token}");
        return await client.SendAsync(request);
    }
}

internal sealed class BffFactory(string? secret = null) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.ConfigureAppConfiguration((_, cfg) =>
            cfg.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:Secret"] = secret ?? string.Empty }));
        builder.ConfigureServices(services =>
        {
            foreach (var name in new[]
            {
                DependencyInjection.FastApiClient,
                DependencyInjection.FastApiStreamClient,
                DependencyInjection.FileServiceClient,
            })
            {
                services.AddHttpClient(name)
                    .ConfigurePrimaryHttpMessageHandler(() => new TestHttpHandler(Respond));
            }
        });
    }

    private static HttpResponseMessage Respond(HttpRequestMessage request)
    {
        var path = request.RequestUri!.AbsolutePath;
        if (path.Contains("/pdf") || path.Contains("/workbook"))
        {
            var resp = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent("%PDF-1.4 fake"u8.ToArray()),
            };
            resp.Content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            resp.Content.Headers.ContentDisposition = new ContentDispositionHeaderValue("attachment")
            {
                FileName = "audit.pdf",
            };
            return resp;
        }
        return TestHttpHandler.Json($"{{\"path\":\"{path}\",\"ok\":true}}");
    }
}
