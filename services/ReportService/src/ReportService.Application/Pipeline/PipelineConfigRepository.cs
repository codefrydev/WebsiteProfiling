using Npgsql;
using WebsiteProfiling.TypedConfig;

namespace ReportService.Application.Pipeline;

/// <summary>Persists flat pipeline config keys to typed Postgres tables (manifest-driven).</summary>
public sealed class PipelineConfigRepository(NpgsqlDataSource dataSource)
{
    private static readonly TypedConfigManifest Manifest = TypedConfigManifest.Current;

    public Task<Dictionary<string, string>> ReadPipelineConfigAsync(CancellationToken cancellationToken = default) =>
        ReadAsync(cancellationToken);

    public async Task SavePipelineConfigAsync(
        IReadOnlyDictionary<string, string> entries,
        CancellationToken cancellationToken = default)
    {
        if (entries.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var tx = await conn.BeginTransactionAsync(cancellationToken);
        await TypedConfigPipelineStore.SaveFlatStateAsync(conn, tx, entries, Manifest, cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    internal static async Task<Dictionary<string, string>> ReadAsync(
        NpgsqlDataSource dataSource,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        return await TypedConfigPipelineStore.ReadFlatStateAsync(conn, Manifest, cancellationToken);
    }

    private async Task<Dictionary<string, string>> ReadAsync(CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        return await TypedConfigPipelineStore.ReadFlatStateAsync(conn, Manifest, cancellationToken);
    }
}
