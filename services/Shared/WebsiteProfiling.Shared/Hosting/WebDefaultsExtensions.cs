using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace WebsiteProfiling.Hosting;

/// <summary>
/// Startup boilerplate shared by every service API: eager DI validation and Swagger with the
/// UI at <c>/docs</c> in Development. Controllers, auth, and middleware ordering stay in each
/// service's Program.cs — their order is service-specific (BFF auth pipeline, AiService MCP).
/// </summary>
public static class WebDefaultsExtensions
{
    /// <summary>
    /// Applies <c>ValidateOnBuild</c>/<c>ValidateScopes</c> and registers the OpenAPI explorer
    /// plus a <c>v1</c> Swagger doc with the given title and description.
    /// </summary>
    public static WebApplicationBuilder AddWebsiteProfilingWebDefaults(
        this WebApplicationBuilder builder,
        string apiTitle,
        string apiDescription,
        Action<SwaggerGenOptions>? configureSwagger = null)
    {
        builder.Host.UseDefaultServiceProvider((_, options) =>
        {
            options.ValidateOnBuild = true;
            options.ValidateScopes = true;
        });

        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = apiTitle,
                Version = "v1",
                Description = apiDescription,
            });
            configureSwagger?.Invoke(options);
        });

        return builder;
    }

    /// <summary>Serves the Swagger UI at <c>/docs</c> in Development only.</summary>
    public static WebApplication UseWebsiteProfilingSwaggerUi(this WebApplication app, string apiTitle)
    {
        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/v1/swagger.json", $"{apiTitle} v1");
                options.RoutePrefix = "docs";
            });
        }

        return app;
    }
}
