namespace WebsiteProfiling.Testing;

/// <summary>
/// Temporarily overrides process environment variables for DI validation tests.
/// </summary>
public sealed class ServiceRegistrationTestEnvironment : IDisposable
{
    private static readonly object Gate = new();
    private readonly Dictionary<string, string?> _previous = new(StringComparer.Ordinal);

    public static ServiceRegistrationTestEnvironment Push() => new();

    public void Set(string key, string? value)
    {
        lock (Gate)
        {
            if (!_previous.ContainsKey(key))
            {
                _previous[key] = Environment.GetEnvironmentVariable(key);
            }

            Environment.SetEnvironmentVariable(key, value);
        }
    }

    public void SetDefaultsForPostgresServices()
    {
        Set("DATABASE_URL", "Host=127.0.0.1;Port=5432;Database=wp_di_test;Username=test;Password=test");
        Set("FASTAPI_URL", "http://127.0.0.1:8096");
    }

    public void Dispose()
    {
        lock (Gate)
        {
            foreach (var (key, value) in _previous)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}
