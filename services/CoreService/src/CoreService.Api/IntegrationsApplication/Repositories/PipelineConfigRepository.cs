using CoreService.Api.IntegrationsApplication.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.IntegrationsApplication.Repositories;

public sealed class PipelineConfigRepository(IntegrationsDbContext db)
{
    private const long SingletonId = 1;

    public async Task<IReadOnlyDictionary<string, string>> ReadKnownAsync(
        CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);

        var startUrl = await db.CrawlSettings.AsNoTracking()
            .Where(x => x.Id == SingletonId)
            .Select(x => x.StartUrl)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(startUrl))
        {
            result["start_url"] = startUrl;
        }

        var bingKey = await db.IntegrationSecrets.AsNoTracking()
            .Where(x => x.Id == SingletonId)
            .Select(x => x.BingWebmasterApiKey)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(bingKey))
        {
            result["bing_webmaster_api_key"] = bingKey;
        }

        return result;
    }
}
