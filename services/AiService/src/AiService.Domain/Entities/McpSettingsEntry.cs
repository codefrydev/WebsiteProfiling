namespace AiService.Domain.Entities;

public sealed class McpSettingsEntry
{
    public long Id { get; set; } = 1;

    public string BearerToken { get; set; } = "";

    public string AllowedHosts { get; set; } = "";

    public string AllowedOrigins { get; set; } = "";

    public string PublicUrl { get; set; } = "";

    public string ToolBundle { get; set; } = "core";

    public string DisabledTools { get; set; } = "";

    public string EnabledDomains { get; set; } = "[\"core\",\"insight\"]";

    public DateTimeOffset UpdatedAt { get; set; }
}
