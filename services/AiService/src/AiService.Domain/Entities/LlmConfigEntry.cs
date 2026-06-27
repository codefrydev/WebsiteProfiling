namespace AiService.Domain.Entities;

public sealed class LlmConfigEntry
{
    public string Key { get; set; } = "";

    public string Value { get; set; } = "";

    public bool IsSecret { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
