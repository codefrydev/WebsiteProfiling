using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Slice;

/// <summary>Link edge summaries — mirrors Python <c>link_edges_report.summarize_link_rel</c>.</summary>
public static class LinkSliceHelpers
{
    public static JsonObject SummarizeLinkRel(JsonArray? edges)
    {
        edges ??= [];
        var internalCount = 0;
        var nofollowInternal = 0;
        var sponsoredInternal = 0;
        var ugcInternal = 0;
        foreach (var node in edges)
        {
            if (node is not JsonObject edge)
            {
                continue;
            }

            if (!string.Equals(JsonCoercion.AsString(edge["link_type"]), "internal", StringComparison.Ordinal))
            {
                continue;
            }

            internalCount++;
            if (JsonCoercion.IsTruthy(edge["is_nofollow"]))
            {
                nofollowInternal++;
            }

            if (edge["is_sponsored"]?.GetValue<bool?>() == true)
            {
                sponsoredInternal++;
            }

            if (edge["is_ugc"]?.GetValue<bool?>() == true)
            {
                ugcInternal++;
            }
        }

        return new JsonObject
        {
            ["total_edges"] = edges.Count,
            ["internal_edges"] = internalCount,
            ["nofollow_internal"] = nofollowInternal,
            ["sponsored_internal"] = sponsoredInternal,
            ["ugc_internal"] = ugcInternal,
            ["external_edges"] = edges.Count - internalCount,
        };
    }
}
