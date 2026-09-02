using System.Text.Json.Nodes;

namespace AiService.Api.Domain.Repositories;

/// <summary>Singleton <c>google_app_settings</c> row (OAuth app credentials).</summary>
public interface IGoogleAppSettingsRepository
{
    Task<GoogleAppSettings> LoadAsync(CancellationToken cancellationToken = default);

    Task MergeAsync(GoogleAppSettingsPatch patch, CancellationToken cancellationToken = default);
}

public sealed class GoogleAppSettings
{
    public string ClientId { get; init; } = "";

    public string ClientSecret { get; init; } = "";

    public JsonObject? ServiceAccountJson { get; init; }

    public int DefaultDateRangeDays { get; init; } = 28;

    public string DeveloperToken { get; init; } = "";

    public string LoginCustomerId { get; init; } = "";
}

public sealed class GoogleAppSettingsPatch
{
    public string? ClientId { get; init; }

    public string? ClientSecret { get; init; }

    public JsonObject? ServiceAccountJson { get; init; }

    public int? DefaultDateRangeDays { get; init; }

    public string? DeveloperToken { get; init; }

    public string? LoginCustomerId { get; init; }
}
