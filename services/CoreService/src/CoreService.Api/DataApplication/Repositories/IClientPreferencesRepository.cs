namespace CoreService.Api.DataApplication.Repositories;

public interface IClientPreferencesRepository
{
    Task<ClientPreferencesDto> GetAsync(CancellationToken cancellationToken = default);

    Task PatchAsync(IReadOnlyDictionary<string, object> updates, CancellationToken cancellationToken = default);
}

public sealed class ClientPreferencesDto
{
    public string DefaultLandingView { get; init; } = "overview";

    public string ChatFabCorner { get; init; } = "bottom-right";

    public bool SidebarCollapsed { get; init; }

    public string NetworkViewMode { get; init; } = "2d";

    public bool ContentStudioAiEnabled { get; init; } = true;

    public string PipelinePythonExe { get; init; } = "python3";

    public string PipelineRepoRoot { get; init; } = "";

    public string RadiusScale { get; init; } = "default";

    public string DensityScale { get; init; } = "default";

    public bool AnimationsEnabled { get; init; } = true;

    public string FontSizeScale { get; init; } = "default";
}
