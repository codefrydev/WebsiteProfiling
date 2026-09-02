using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Registry;
using AiService.Api.Tools.Slice;

namespace AiService.Api.Tools.Handlers.Slice;

/// <summary>
/// Bulk payload slice reads — ports simple Python tools using <c>payload_dict_slice</c> / <c>payload_field</c>.
/// </summary>
public static class PayloadSliceToolHandlers
{
    private static readonly IReadOnlyDictionary<string, string> DictSliceTools =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["get_crux_summary"] = "crux_summary",
            ["get_hreflang_summary"] = "hreflang_summary",
            ["get_language_summary"] = "language_summary",
            ["get_tech_stack_summary"] = "tech_stack_summary",
            ["get_portfolio_benchmark"] = "portfolio_benchmark",
            ["get_response_time_stats"] = "response_time_stats",
            ["get_depth_distribution"] = "depth_distribution",
            ["get_seo_health"] = "seo_health",
            ["get_text_content_analysis"] = "text_content_analysis",
            ["get_content_analytics"] = "content_analytics",
            ["get_social_coverage"] = "social_coverage",
            ["get_keyword_opportunities"] = "keyword_opportunities",
            ["get_ner_site_summary"] = "ner_site_summary",
            ["get_bing_backlinks"] = "bing_backlinks",
        };

    public static IEnumerable<IToolHandler> AllHandlers()
    {
        foreach (var (toolName, payloadKey) in DictSliceTools)
        {
            yield return new DelegatingToolHandler(
                toolName,
                (db, ctx, args, ct) => DictSliceAsync(db, ctx, payloadKey, ct));
        }

        yield return new DelegatingToolHandler(
            "get_semantic_keyword_clusters",
            (db, ctx, args, ct) => FieldSliceAsync(db, ctx, args, "semantic_keyword_clusters", "clusters", ct));

        yield return new DelegatingToolHandler(
            "get_content_duplicates",
            (db, ctx, args, ct) => FieldSliceAsync(db, ctx, args, "content_duplicates", "duplicates", ct));
    }

    private static async Task<JsonObject> DictSliceAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        string payloadKey,
        CancellationToken cancellationToken)
    {
        var payload = await ctx.LoadPayloadAsync(db, cancellationToken);
        return PayloadSliceHelpers.PayloadDictSlice(payload, payloadKey);
    }

    private static async Task<JsonObject> FieldSliceAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string payloadKey,
        string itemKey,
        CancellationToken cancellationToken)
    {
        var payload = await ctx.LoadPayloadAsync(db, cancellationToken);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 50);
        return PayloadSliceHelpers.PayloadField(payload, payloadKey, limit, 50, itemKey: itemKey);
    }
}
