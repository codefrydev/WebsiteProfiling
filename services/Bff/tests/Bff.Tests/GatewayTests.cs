using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
    public async Task Redirect_location_header_is_passed_through()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/integrations/google/auth?propertyId=1");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
            response.Headers.Location?.ToString());
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

    [Fact]
    public async Task Get_routes_to_data_service_when_path_in_allowlist()
    {
        using var factory = new BffFactory(dataRoutes: "/api/report/meta");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Get_portfolio_routes_to_data_service_when_path_in_allowlist()
    {
        using var factory = new BffFactory(dataRoutes: "/api/report/portfolio");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/portfolio?widget=groups");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Delete_portfolio_routes_to_data_service_when_path_in_allowlist()
    {
        using var factory = new BffFactory(secret: Secret, dataRoutes: "/api/portfolio");
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Delete, "/api/portfolio/delete")
        {
            Content = JsonContent.Create(new { crawlRunId = 1L }),
        };
        var token = WpSessionTokens.Create("analyst", Secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), 604800);
        request.Headers.Add("Cookie", $"{WpSessionTokens.CookieName}={token}");
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Get_issues_status_routes_to_data_service_when_path_in_allowlist()
    {
        using var factory = new BffFactory(dataRoutes: "/api/issues");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/issues/status?propertyId=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Put_issues_status_routes_to_data_service_when_path_in_allowlist()
    {
        using var factory = new BffFactory(secret: Secret, dataRoutes: "/api/issues");
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Put, "/api/issues/status")
        {
            Content = JsonContent.Create(new
            {
                propertyId = 1L,
                message = "Missing meta description",
                status = "open",
            }),
        };
        var token = WpSessionTokens.Create("analyst", Secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), 604800);
        request.Headers.Add("Cookie", $"{WpSessionTokens.CookieName}={token}");
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Put_issues_status_forbidden_for_readonly_role()
    {
        using var factory = new BffFactory(secret: Secret, dataRoutes: "/api/issues");
        var response = await Send(factory, HttpMethod.Put, "/api/issues/status", "client-readonly");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_stays_on_fastapi_when_path_not_in_allowlist()
    {
        using var factory = new BffFactory(dataRoutes: "/api/report/portfolio");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Empty_allowlist_keeps_all_reads_on_fastapi()
    {
        using var factory = new BffFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.DoesNotContain("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Data_routed_get_still_requires_authentication()
    {
        using var factory = new BffFactory(secret: Secret, dataRoutes: "/api/report/meta");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/report/meta");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Data_routed_get_allowed_for_readonly_role_and_hits_data()
    {
        using var factory = new BffFactory(secret: Secret, dataRoutes: "/api/report/meta");
        var response = await Send(factory, HttpMethod.Get, "/api/report/meta", "viewer");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"upstream\":\"data\"", await response.Content.ReadAsStringAsync());
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

internal sealed class BffFactory(string? secret = null, string? dataRoutes = null) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.ConfigureAppConfiguration((_, cfg) =>
        {
            var settings = new Dictionary<string, string?> { ["Auth:Secret"] = secret ?? string.Empty };
            if (dataRoutes is not null)
            {
                settings["Upstream:DataRoutes:0"] = dataRoutes;
            }
            cfg.AddInMemoryCollection(settings);
        });
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
            // Stub the Data service with a distinguishable body so cutover routing can be asserted.
            services.AddHttpClient(DependencyInjection.DataClient)
                .ConfigurePrimaryHttpMessageHandler(() => new TestHttpHandler(RespondData));
        });
    }

    private static HttpResponseMessage RespondData(HttpRequestMessage request) =>
        TestHttpHandler.Json($"{{\"path\":\"{request.RequestUri!.AbsolutePath}\",\"upstream\":\"data\"}}");

    private static HttpResponseMessage Respond(HttpRequestMessage request)
    {
        var path = request.RequestUri!.AbsolutePath;
        if (path.Contains("/google/auth"))
        {
            // Simulate FastAPI's OAuth consent 302 — the forwarder must pass Location through.
            var redirect = new HttpResponseMessage(HttpStatusCode.Redirect);
            redirect.Headers.Location = new Uri("https://accounts.google.com/o/oauth2/v2/auth?client_id=x");
            return redirect;
        }
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
