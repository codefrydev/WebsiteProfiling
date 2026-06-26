namespace AiService.Domain.Entities;

public sealed class GoogleAppSettingsEntry
{
    public long Id { get; set; } = 1;

    public string ClientId { get; set; } = "";

    public string ClientSecret { get; set; } = "";

    public string? ServiceAccountJson { get; set; }

    public int DefaultDateRangeDays { get; set; } = 28;

    public DateTimeOffset UpdatedAt { get; set; }

    public string? DeveloperToken { get; set; }

    public string? LoginCustomerId { get; set; }
}
