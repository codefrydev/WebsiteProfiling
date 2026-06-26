using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Domain;
using AiService.Tools.Persistence;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using AiService.Tools.Slice;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Core;

public static class CoreToolHandlers
{
    public static Task<JsonObject> SearchAuditToolsAsync(
        ToolCatalog catalog,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = db;
        _ = ctx;
        _ = cancellationToken;
        var query = JsonCoercion.AsString(args["query"]) ?? JsonCoercion.AsString(args["q"]) ?? "";
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 10, 50);
        if (string.IsNullOrWhiteSpace(query))
        {
            return Task.FromResult(new JsonObject
            {
                ["error"] = "query is required",
                ["tools"] = new JsonArray(),
                ["tool_names"] = new JsonArray(),
            });
        }

        var matches = ToolCatalogSearch.Search(catalog, query, limit);
        var names = new JsonArray(matches.Select(m => JsonValue.Create(m["name"]?.GetValue<string>() ?? "")).ToArray());
        var tools = new JsonArray(matches.Select(m => m.DeepClone()).ToArray());
        return Task.FromResult(new JsonObject
        {
            ["query"] = query,
            ["tools"] = tools,
            ["tool_names"] = names,
            ["total"] = matches.Count,
        });
    }

    public static Task<JsonObject> ListToolDomainsAsync(
        ToolCatalog catalog,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = db;
        _ = ctx;
        _ = args;
        _ = cancellationToken;
        var byDomain = McpToolDomains.GroupToolsByDomain(catalog.ToolNames);
        var domains = new JsonArray();
        foreach (var domain in McpToolDomains.CanonicalDomains)
        {
            var tools = byDomain.GetValueOrDefault(domain) ?? [];
            domains.Add(new JsonObject
            {
                ["domain"] = domain,
                ["tool_count"] = tools.Count,
                ["example_prompt"] = McpToolDomains.DomainExamplePrompts.GetValueOrDefault(domain) ?? "",
                ["mcp_bundles"] = new JsonArray(
                    McpToolDomains.McpDomainBundles
                        .Where(pair => pair.Key != "full" && pair.Value.Contains(domain))
                        .Select(pair => JsonValue.Create(pair.Key))
                        .ToArray()),
            });
        }

        var counts = new JsonObject();
        foreach (var (domain, names) in byDomain)
        {
            counts[domain] = names.Count;
        }

        return Task.FromResult(new JsonObject
        {
            ["domains"] = domains,
            ["domain_tool_counts"] = counts,
        });
    }

    public static async Task<JsonObject> GetDataCoverageReportAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id is required", ["checks"] = new JsonArray() };
        }

        var property = await db.Properties.AsNoTracking()
            .Where(x => x.Id == propertyId)
            .Select(x => new { x.GoogleRefreshToken })
            .FirstOrDefaultAsync(cancellationToken);
        if (property is null)
        {
            return new JsonObject { ["error"] = "property not found", ["checks"] = new JsonArray() };
        }

        var hasGoogleOAuth = !string.IsNullOrWhiteSpace(property.GoogleRefreshToken);

        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        var google = await scoped.LoadGoogleAsync(db, cancellationToken);
        var keywords = await scoped.LoadKeywordsAsync(db, cancellationToken);
        var gscLinks = await scoped.LoadGscLinksAsync(db, cancellationToken);
        var googleFull = await scoped.LoadGoogleFullAsync(db, cancellationToken);

        var checks = new JsonArray
        {
            Check("google_oauth", hasGoogleOAuth, "Connect Google OAuth in Integrations."),
            Check("gsc_data", HasGscSummary(google), "Map GSC site URL and re-run pipeline."),
            Check("ga4_data", HasGa4Summary(google), "Connect GA4 property in Integrations."),
            Check("keyword_data", HasKeywordData(keywords), "Run keyword enrichment in pipeline."),
            Check("gsc_links_import", HasGscLinks(gscLinks), "Import GSC Links CSV in Backlinks view."),
            Check("moz_majestic_overlay", HasThirdPartyOverlay(gscLinks), "Upload Moz or Majestic CSV in Backlinks > third-party overlay."),
            Check("image_inventory", payload.ContainsKey("image_inventory"), "Set probe_image_inventory=true in pipeline config and rebuild report."),
            Check("axe_violations", payload.ContainsKey("axe_audit_summary") || payload.ContainsKey("axe_violations"), "Set enable_axe=true and use javascript/auto crawl rendering."),
            Check("rich_results_validation", payload.ContainsKey("rich_results_validation") || payload.ContainsKey("rich_results_meta"), "Enable rich results validation on report build."),
            Check("audit_report", payload.Count > 0, "Run a site audit crawl and report build."),
            Check("gsc_full_blob", googleFull?["gsc_full"] is JsonObject, "Re-run Google fetch to populate gsc_full for list/decay tools."),
            Check("ga4_full_blob", googleFull?["ga4_full"] is JsonObject, "Re-run GA4 fetch to populate ga4_full for landing-page list tools."),
            Check("keyword_history", keywords?["fetched_at"] is not null, "Run keyword enrichment twice for rank delta tools."),
            Check("text_content_analysis", payload.ContainsKey("text_content_analysis"), "Report build includes text_content_analysis from crawl."),
            Check("semantic_keyword_clusters", payload.ContainsKey("semantic_keyword_clusters"), "Enable llm_enable_keyword_clusters for cluster list tools."),
            Check("access_log", payload.ContainsKey("log_analysis") || payload.ContainsKey("access_log_summary"), "Upload access logs in Integrations for log list tools."),
        };

        var missing = checks
            .OfType<JsonObject>()
            .Where(c => c["populated"]?.GetValue<bool>() == false)
            .Select(c => c["signal"]?.GetValue<string>() ?? "")
            .Where(s => s.Length > 0)
            .ToList();

        return new JsonObject
        {
            ["property_id"] = propertyId,
            ["checks"] = checks,
            ["missing_count"] = missing.Count,
            ["missing"] = new JsonArray(missing.Select(m => JsonValue.Create(m)).ToArray()),
            ["provenance"] = new JsonObject
            {
                ["sources"] = new JsonArray("property", "google_data", "report_payload"),
                ["confidence"] = "high",
            },
            ["insights"] = new JsonArray(
                new[] { $"{checks.Count - missing.Count}/{checks.Count} data signals populated." }
                    .Concat(missing.Take(5).Select(m => $"Enable: {m}"))
                    .Select(x => JsonValue.Create(x))
                    .ToArray()),
        };
    }

    private static JsonObject Check(string name, bool populated, string hint) => new()
    {
        ["signal"] = name,
        ["populated"] = populated,
        ["config_hint"] = populated ? "" : hint,
    };

    private static bool HasGscSummary(JsonObject? google) =>
        google?["gsc"] is JsonObject gsc && gsc["summary"] is JsonObject summary && summary.Count > 0;

    private static bool HasGa4Summary(JsonObject? google) =>
        google?["ga4"] is JsonObject ga4 && ga4["summary"] is JsonObject summary && summary.Count > 0;

    private static bool HasKeywordData(JsonObject? keywords) =>
        keywords is not null && (keywords["rows"] is JsonArray rows && rows.Count > 0
            || keywords.ContainsKey("total_keywords"));

    private static bool HasGscLinks(JsonObject? gscLinks) =>
        gscLinks is not null && (gscLinks["sample_links"] is JsonArray links && links.Count > 0
            || gscLinks.ContainsKey("referring_domains"));

    private static bool HasThirdPartyOverlay(JsonObject? gscLinks) =>
        gscLinks?["third_party_overlays"] is JsonArray overlays && overlays.Count > 0;
}

public sealed class InjectingToolHandler(
    string toolName,
    Func<IServiceProvider, AuditToolsDbContext, AuditToolContext, JsonObject, CancellationToken, Task<JsonObject>> handle,
    IServiceProvider serviceProvider) : IToolHandler
{
    public string ToolName { get; } = toolName;

    public Task<JsonObject> HandleAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => handle(serviceProvider, db, ctx, args, cancellationToken);
}
