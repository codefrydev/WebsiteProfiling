using System.Text.Json;
using IntegrationsService.Application.Persistence;
using IntegrationsService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Repositories;

public sealed class GoogleAppSettingsRepository(IntegrationsDbContext db)
{
    public const int SingletonId = 1;

    private static readonly string[] Scopes =
    [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/adwords",
    ];

    public static IReadOnlyList<string> GoogleScopes => Scopes;

    public async Task<GoogleAppSettings> ReadAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.GoogleAppSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == SingletonId, cancellationToken);

        return row ?? new GoogleAppSettings { Id = SingletonId, DefaultDateRangeDays = 28 };
    }

    public async Task<bool> HasServiceAccountAsync(CancellationToken cancellationToken = default)
    {
        var row = await ReadAsync(cancellationToken);
        return !string.IsNullOrWhiteSpace(row.ServiceAccountJson)
            && row.ServiceAccountJson != "null";
    }

    public async Task<bool> HasClientCredentialsAsync(CancellationToken cancellationToken = default)
    {
        var row = await ReadAsync(cancellationToken);
        var clientId = (row.ClientId ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID") ?? "").Trim();
        return !string.IsNullOrWhiteSpace(clientId);
    }

    public async Task<(string ClientId, string ClientSecret)> AppClientCredentialsAsync(
        CancellationToken cancellationToken = default)
    {
        var row = await ReadAsync(cancellationToken);
        var clientId = (row.ClientId ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID") ?? "").Trim();
        var clientSecret = (row.ClientSecret ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET") ?? "").Trim();
        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
        {
            throw new InvalidOperationException(
                "Google Client ID or Secret missing. Complete Step 1 in Integrations.");
        }

        return (clientId, clientSecret);
    }

    public async Task<int> DefaultDateRangeDaysAsync(CancellationToken cancellationToken = default)
    {
        var row = await ReadAsync(cancellationToken);
        return row.DefaultDateRangeDays > 0 ? row.DefaultDateRangeDays : 28;
    }

    public async Task<JsonDocument?> ReadServiceAccountJsonAsync(CancellationToken cancellationToken = default)
    {
        var row = await ReadAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(row.ServiceAccountJson) || row.ServiceAccountJson == "null")
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(row.ServiceAccountJson);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
