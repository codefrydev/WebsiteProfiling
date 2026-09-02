using System.Text.Json;
using System.Text.Json.Nodes;
using CoreService.Api.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.Application.Repositories;

public sealed class LighthouseDbReader(ReportDbContext db)
{
    public async Task<IReadOnlyDictionary<string, JsonNode>> ReadPageSummariesAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await db.LighthousePageSummaries
            .AsNoTracking()
            .Select(x => new { x.Url, x.Data })
            .ToListAsync(cancellationToken);

        var outMap = new Dictionary<string, JsonNode>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var url = row.Url.Trim().TrimEnd('/');
            var raw = string.IsNullOrWhiteSpace(row.Data) ? "{}" : row.Data;
            try
            {
                var node = JsonNode.Parse(raw);
                if (node is not null)
                {
                    outMap[url] = node;
                }
            }
            catch (JsonException)
            {
                // skip malformed row
            }
        }

        return outMap;
    }

    public async Task<JsonNode?> ReadGlobalSummaryAsync(CancellationToken cancellationToken = default)
    {
        var raw = await db.LighthouseGlobalSummaries
            .AsNoTracking()
            .OrderByDescending(x => x.Id)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
