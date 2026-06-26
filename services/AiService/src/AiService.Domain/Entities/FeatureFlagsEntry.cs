namespace AiService.Domain.Entities;

public sealed class FeatureFlagsEntry
{
    public long Id { get; set; } = 1;

    public bool PipelineEnabled { get; set; } = true;

    public bool WriteEnabled { get; set; } = true;

    public bool PagesMdEnabled { get; set; } = true;

    public bool ChatEnabled { get; set; } = true;

    public bool McpVisible { get; set; } = true;

    public bool SecretsVisible { get; set; } = true;

    public DateTimeOffset UpdatedAt { get; set; }
}
