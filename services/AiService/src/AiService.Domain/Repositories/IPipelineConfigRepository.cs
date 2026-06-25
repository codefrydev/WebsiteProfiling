namespace AiService.Domain.Repositories;

/// <summary>Read/write access to <c>pipeline_config</c> (known + unknown keys).</summary>
public interface IPipelineConfigRepository
{
    /// <summary>All keys (known + unknown) as a flat dictionary — for MCP/tool selection.</summary>
    Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default);

    Task<(IReadOnlyDictionary<string, string> Known, IReadOnlyList<PipelineConfigUnknownEntry> Unknown)> LoadFullAsync(
        CancellationToken cancellationToken = default);

    Task SaveAsync(
        IReadOnlyDictionary<string, string> known,
        IReadOnlyList<PipelineConfigUnknownEntry> unknown,
        CancellationToken cancellationToken = default);
}

public sealed record PipelineConfigUnknownEntry(string Key, string Value);
