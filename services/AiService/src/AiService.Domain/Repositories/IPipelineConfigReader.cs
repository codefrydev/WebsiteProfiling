namespace AiService.Domain.Repositories;

/// <summary>Read-only access to <c>pipeline_config</c> keys (MCP domain, disabled tools, etc.).</summary>
public interface IPipelineConfigReader
{
    Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default);
}
