namespace ConfigService.Application.Repositories;

public interface IPipelineSettingsRepository
{
    Task<PipelineSettingsResponse> GetAsync(CancellationToken cancellationToken = default);

    Task SaveStateAsync(IReadOnlyDictionary<string, string> state, CancellationToken cancellationToken = default);
}

public sealed class PipelineSettingsResponse
{
    public required Dictionary<string, Dictionary<string, string>> Domains { get; init; }

    public required WorkspaceSettingsPayload Workspace { get; init; }

    public required Dictionary<string, string> State { get; init; }

    public string Source { get; init; } = "db";
}

public sealed class WorkspaceSettingsPayload
{
    public long? ActivePropertyId { get; init; }

    public string WarningMapperInput { get; init; } = "";

    public string WarningMapperInputType { get; init; } = "lighthouse";
}
