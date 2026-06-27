using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Persistence;
using AiService.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Repositories;

public sealed class GoogleAppSettingsRepository(AiDbContext db) : IGoogleAppSettingsRepository
{
    private const long SingletonId = 1;

    public async Task<GoogleAppSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.GoogleAppSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is null)
        {
            return new GoogleAppSettings();
        }

        return new GoogleAppSettings
        {
            ClientId = row.ClientId.Trim(),
            ClientSecret = row.ClientSecret.Trim(),
            ServiceAccountJson = ParseServiceAccountJson(row.ServiceAccountJson),
            DefaultDateRangeDays = row.DefaultDateRangeDays,
            DeveloperToken = (row.DeveloperToken ?? "").Trim(),
            LoginCustomerId = (row.LoginCustomerId ?? "").Trim(),
        };
    }

    public async Task MergeAsync(GoogleAppSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var row = await db.GoogleAppSettings.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is null)
        {
            return;
        }

        var changed = false;
        if (patch.ClientId is not null) { row.ClientId = patch.ClientId; changed = true; }
        if (patch.ClientSecret is not null) { row.ClientSecret = patch.ClientSecret; changed = true; }
        if (patch.ServiceAccountJson is not null)
        {
            row.ServiceAccountJson = patch.ServiceAccountJson.ToJsonString();
            changed = true;
        }

        if (patch.DefaultDateRangeDays is not null)
        {
            row.DefaultDateRangeDays = patch.DefaultDateRangeDays.Value;
            changed = true;
        }

        if (patch.DeveloperToken is not null)
        {
            row.DeveloperToken = string.IsNullOrWhiteSpace(patch.DeveloperToken) ? null : patch.DeveloperToken;
            changed = true;
        }

        if (patch.LoginCustomerId is not null)
        {
            row.LoginCustomerId = string.IsNullOrWhiteSpace(patch.LoginCustomerId) ? null : patch.LoginCustomerId;
            changed = true;
        }

        if (!changed)
        {
            return;
        }

        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    private static JsonObject? ParseServiceAccountJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(raw) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
