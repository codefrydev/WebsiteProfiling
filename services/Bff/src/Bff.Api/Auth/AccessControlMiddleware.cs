using System.Security.Claims;
using Bff.Api.Application.Options;
using Bff.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Bff.Api.Auth;

/// <summary>
/// Enforces <see cref="AccessPolicy"/> for every request using the principal populated by
/// <see cref="WpSessionAuthenticationHandler"/>. Emits ProblemDetails (401/403) on denial.
/// When auth is disabled (no AUTH_SECRET) everything is permitted, matching the TS contract.
/// </summary>
public sealed class AccessControlMiddleware(RequestDelegate next, IOptions<AuthOptions> auth)
{
    private readonly AuthOptions _auth = auth.Value;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_auth.Enabled)
        {
            await next(context);
            return;
        }

        var requirement = AccessPolicy.Resolve(context.Request.Method, context.Request.Path);
        if (requirement == AccessRequirement.Anonymous)
        {
            await next(context);
            return;
        }

        var user = context.User;
        var authenticated = user.Identity?.IsAuthenticated == true;
        if (!authenticated)
        {
            await WriteProblem(context, StatusCodes.Status401Unauthorized, "Authentication required");
            return;
        }

        var role = user.FindFirstValue(ClaimTypes.Role);
        var allowed = requirement switch
        {
            AccessRequirement.Read => true, // any authenticated role, including read-only
            AccessRequirement.Mutate => Roles.CanMutate(role),
            AccessRequirement.Chat => Roles.CanChat(role),
            _ => false,
        };

        if (!allowed)
        {
            await WriteProblem(context, StatusCodes.Status403Forbidden, "Forbidden");
            return;
        }

        await next(context);
    }

    private static Task WriteProblem(HttpContext context, int status, string title)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
        };
        return context.Response.WriteAsJsonAsync(problem, problem.GetType(), options: null, contentType: "application/problem+json");
    }
}
