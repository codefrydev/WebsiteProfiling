namespace WebsiteProfiling.Contracts.Config;

/// <summary>Consistent JSON error bodies for browser + FastAPI parity (<c>detail</c> and <c>error</c>).</summary>
public static class ApiErrorBodies
{
    public static object BadRequest(string message) => new { detail = message, error = message };

    public static object NotFound(string message) => new { detail = message, error = message };

    public static object Conflict(string message) => new { detail = message, error = message };
}
