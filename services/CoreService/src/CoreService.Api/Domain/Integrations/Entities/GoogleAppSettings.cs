namespace CoreService.Api.Domain.Integrations.Entities;

/// <summary>Singleton OAuth app settings row (<c>google_app_settings</c>, id=1).</summary>
public sealed class GoogleAppSettings
{
    public int Id { get; set; } = 1;

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }

    public string? ServiceAccountJson { get; set; }

    public int DefaultDateRangeDays { get; set; } = 28;

    public DateTimeOffset? UpdatedAt { get; set; }

    public string? DeveloperToken { get; set; }

    public string? LoginCustomerId { get; set; }
}
