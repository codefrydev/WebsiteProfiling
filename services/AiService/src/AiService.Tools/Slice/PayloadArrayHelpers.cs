using System.Text.Json.Nodes;
using AiService.Tools.Context;

using AiService.Tools.Persistence;
namespace AiService.Tools.Slice;

/// <summary>Common capped payload array reads.</summary>
public static class PayloadArrayHelpers
{
    public static async Task<JsonObject> CapPayloadArrayAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string payloadKey,
        string outputKey,
        int defaultLimit,
        int maxCap,
        CancellationToken cancellationToken,
        Func<JsonNode?, bool>? filter = null)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return MissingList(outputKey);
        }

        if (payload[payloadKey] is not JsonArray source)
        {
            source = [];
        }

        var items = new List<JsonNode?>();
        foreach (var node in source)
        {
            if (filter is null || filter(node))
            {
                items.Add(node);
            }
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], defaultLimit, maxCap);
        var sliced = PayloadSliceHelpers.CapList(items, limit, maxCap);
        return new JsonObject
        {
            [outputKey] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static JsonObject MissingList(string outputKey) => new()
    {
        ["error"] = "no report found",
        [outputKey] = new JsonArray(),
        ["total"] = 0,
        ["truncated"] = false,
    };
}
